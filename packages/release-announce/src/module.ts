import { module, type PipelineModule } from '@footprintjs/ci';
import { decide, flowChart } from 'footprintjs';
import type { RunnableFlowChart, TypedScope } from 'footprintjs';
import { parseChangelog, type ParsedChangelog } from './changelog-parser.js';
import { renderTemplate, type TemplateName } from './templates.js';
import { twitterAdapter } from './platforms/twitter.js';
import { linkedinAdapter } from './platforms/linkedin.js';
import { devtoAdapter } from './platforms/devto.js';
import {
  type FormattedContent,
  type PlatformAdapter,
  type PlatformName,
  type PostResult,
} from './platforms/types.js';
import { isMajorVersion, waitForApproval, type ReviewMode } from './review-gate.js';

export interface ReleaseAnnounceOptions {
  platforms: PlatformName[];
  template?: TemplateName;
  emojiPrefix?: string;
  manualReviewOn?: ReviewMode;
  /** Override: approve automatically (e.g. for tests). */
  approvalProbe?: () => Promise<boolean>;
  /** Poll interval for the review gate. Default: 30_000ms. */
  reviewIntervalMs?: number;
  /** Hard timeout for the review gate. Default: 1h. */
  reviewTimeoutMs?: number;
  /** Override: preload adapters (skip dynamic import — useful for tests). */
  platformOverrides?: Partial<Record<PlatformName, PlatformAdapter>>;
  /** Max tweet length. Defaults to platform-defined 280. */
  maxTweetLength?: number;
  /** Repo URL appended to announcement. */
  repoUrl?: string;
}

/**
 * Shape of the FootPrint scope for the release-announce flow. Each stage
 * reads and writes typed properties via FootPrint's `TypedScope`.
 */
export interface AnnounceState {
  /** Raw release body supplied by the trigger payload. */
  releaseBody: string;
  /** Parsed changelog buckets. */
  changelog: ParsedChangelog;
  /** Human-readable version string (e.g. "v1.4.0"). */
  version: string;
  /** Rendered announcement content. */
  content: FormattedContent;
  /** Review-gate routing key. */
  reviewRoute: 'auto' | 'manual';
  /** Per-platform post results keyed by platform name. */
  results: Record<string, PostResult | { error: string }>;
  /** Summary counts. */
  successes: string[];
  failures: string[];
}

/**
 * Runtime args passed to the flow via `executor.run({ input })`. The
 * `@footprintjs/ci` runner passes the `Trigger` directly as input, so args
 * IS the trigger (not nested).
 */
interface AnnounceArgs {
  event: string;
  ref?: string;
  payload?: { release?: { body?: string; tag_name?: string } };
}

/**
 * Build a release-announce pipeline module. The returned module wraps a
 * full `RunnableFlowChart` — you can plug it into `pipeline({ flow: () =>
 * announce.build() })` or call `.build()` directly.
 */
export function releaseAnnounce(opts: ReleaseAnnounceOptions): PipelineModule {
  return module('release-announce', () => buildChart(opts));
}

function buildChart(
  opts: ReleaseAnnounceOptions
): RunnableFlowChart<any, TypedScope<AnnounceState>> {
  const builder = flowChart<AnnounceState>(
    'ParseChangelog',
    (scope) => {
      const args = scope.$getArgs<AnnounceArgs>();
      const body = args?.payload?.release?.body ?? '';
      scope.releaseBody = body;
      scope.changelog = parseChangelog(body);
      scope.version = scope.changelog.version ?? args?.ref ?? 'unknown';
    },
    'parse-changelog',
    undefined,
    'Parse the release changelog into typed buckets'
  )
    .addFunction(
      'FormatContent',
      (scope) => {
        const rendered = renderTemplate(opts.template ?? 'default', {
          version: scope.version,
          changelog: scope.changelog,
          ...(opts.emojiPrefix !== undefined ? { emojiPrefix: opts.emojiPrefix } : {}),
          ...(opts.repoUrl ? { repoUrl: opts.repoUrl } : {}),
        });
        scope.content = { text: rendered.text };
      },
      'format-content',
      'Render the announcement content from the changelog'
    )
    .addDeciderFunction(
      'ReviewGate',
      (scope) => {
        const mode = opts.manualReviewOn ?? 'none';
        return decide(
          scope,
          [
            {
              when: () => mode === 'major' && isMajorVersion(scope.version),
              then: 'manual',
              label: 'Major version release — manual approval required',
            },
          ],
          'auto'
        );
      },
      'review-gate',
      'Route to manual approval for major releases'
    )
      .addFunctionBranch(
        'manual',
        'WaitForApproval',
        async (scope) => {
          const probe = opts.approvalProbe ?? (async () => false);
          await waitForApproval({
            isApproved: probe,
            intervalMs: opts.reviewIntervalMs ?? 30_000,
            timeoutMs: opts.reviewTimeoutMs ?? 60 * 60 * 1000,
          });
          scope.reviewRoute = 'manual';
        },
        'wait-for-approval'
      )
      .addFunctionBranch(
        'auto',
        'AutoApprove',
        (scope) => {
          scope.reviewRoute = 'auto';
        },
        'auto-approve'
      )
      .setDefault('auto')
      .end()
    // Platform posts are sequential. Parallel fan-out via
    // `addListOfFunction` is deferred until we have a standalone repro for
    // the builder semantics with a single branch.
    ;

  for (const name of opts.platforms) {
    builder.addFunction(
      `PostTo${capitalize(name)}`,
      async (scope) => {
        const adapter =
          opts.platformOverrides?.[name] ?? (await resolvePlatform(name));
        const secrets = readPlatformSecrets(scope, adapter);
        try {
          const result = await adapter.post(scope.content, secrets);
          const existing = scope.successes ?? [];
          scope.successes = [...existing, name];
          scope.results = { ...(scope.results ?? {}), [name]: result };
        } catch (err) {
          const existing = scope.failures ?? [];
          scope.failures = [...existing, name];
          scope.results = {
            ...(scope.results ?? {}),
            [name]: { error: (err as Error).message },
          };
        }
      },
      `post-${name}`,
      `Post the release announcement to ${name}`
    );
  }

  builder.addFunction(
    'LogMetrics',
    (scope) => {
      scope.$metric('announce.successes', scope.successes?.length ?? 0);
      scope.$metric('announce.failures', scope.failures?.length ?? 0);
    },
    'log-metrics',
    'Emit success/failure metrics'
  );

  return builder.build();
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

async function resolvePlatform(name: PlatformName): Promise<PlatformAdapter> {
  switch (name) {
    case 'twitter':
      return twitterAdapter();
    case 'linkedin':
      return linkedinAdapter();
    case 'devto':
      return devtoAdapter();
    default: {
      const _exhaustive: never = name;
      throw new Error(`Unknown platform: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Read platform credentials from `process.env`. Secrets are never written to
 * scope, so they don't appear in FootPrint's narrative, commit log, or
 * snapshot. In GitHub Actions the env is the canonical place for secrets.
 */
function readPlatformSecrets(
  _scope: TypedScope<AnnounceState>,
  adapter: PlatformAdapter
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const key of adapter.requiredSecrets()) {
    out[key] = process.env[key];
  }
  return out;
}
