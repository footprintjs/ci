import { module, type PipelineModule } from '@footprintjs/ci';
import type { FootPrintBuilder, StageFn } from '@footprintjs/ci';
import { parseChangelog, type ParsedChangelog } from './changelog-parser';
import { renderTemplate, type TemplateName } from './templates';
import { twitterAdapter } from './platforms/twitter';
import { linkedinAdapter } from './platforms/linkedin';
import { devtoAdapter } from './platforms/devto';
import type {
  FormattedContent,
  PlatformAdapter,
  PlatformName,
  PostResult,
} from './platforms/types';
import { reviewBranchFor, waitForApproval, type ReviewMode } from './review-gate';

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

interface FormattedPayload {
  version: string;
  changelog: ParsedChangelog;
  content: FormattedContent;
  platforms: PlatformName[];
}

/**
 * Build a pipeline module that announces a release to the configured social
 * platforms.
 *
 * Example:
 * ```ts
 * pipeline({
 *   flow: (fp) => fp.stage('announce', releaseAnnounce({
 *     platforms: ['twitter'],
 *     manualReviewOn: 'major',
 *   }).apply),
 * });
 * ```
 */
export function releaseAnnounce(opts: ReleaseAnnounceOptions): PipelineModule {
  const platformList = opts.platforms;

  return module('release-announce', (fp: FootPrintBuilder) =>
    fp
      .stage('parseChangelog', parseChangelogStage)
      .stage('formatContent', formatContentStage(opts))
      .decider('reviewGate', reviewGateDecider(opts))
      .branch('manual', waitForApprovalStage(opts))
      .branch('auto', passthroughStage)
      .fork(
        platformList.map((name) => ({
          name,
          stage: postToPlatformStage(name, opts),
          retry: { maxAttempts: 3, backoff: 'exponential' as const, initialDelayMs: 1000 },
        }))
      )
      .join('collectResults', collectResultsStage)
      .stage('logMetrics', logMetricsStage)
  );
}

const parseChangelogStage: StageFn = async (_input, ctx) => {
  const payload = (ctx.trigger.payload ?? {}) as {
    release?: { body?: string; tag_name?: string };
  };
  const body = payload.release?.body ?? '';
  const changelog = parseChangelog(body);
  const version = changelog.version ?? ctx.trigger.ref ?? 'unknown';
  ctx.adapter.log(
    'info',
    `parsed changelog: ${changelog.features.length} features, ${changelog.fixes.length} fixes, ${changelog.breaking.length} breaking`
  );
  return { version, changelog };
};

function formatContentStage(opts: ReleaseAnnounceOptions): StageFn {
  return async (input, ctx) => {
    const { version, changelog } = input as {
      version: string;
      changelog: ParsedChangelog;
    };
    const rendered = renderTemplate(opts.template ?? 'default', {
      version,
      changelog,
      emojiPrefix: opts.emojiPrefix,
      repoUrl: opts.repoUrl ?? detectRepoUrl(ctx.env),
    });
    const content: FormattedContent = { text: rendered.text };
    return {
      version,
      changelog,
      content,
      platforms: opts.platforms,
    } satisfies FormattedPayload;
  };
}

function reviewGateDecider(opts: ReleaseAnnounceOptions) {
  return async (input: unknown) => {
    const payload = input as FormattedPayload;
    return reviewBranchFor(payload.version, opts.manualReviewOn ?? 'none');
  };
}

function waitForApprovalStage(opts: ReleaseAnnounceOptions): StageFn {
  return async (input, ctx) => {
    const payload = input as FormattedPayload;
    ctx.adapter.log(
      'info',
      `review gate: waiting for /approve on ${payload.version}`
    );
    const probe = opts.approvalProbe ?? (async () => false);
    await waitForApproval({
      isApproved: probe,
      intervalMs: opts.reviewIntervalMs ?? 30_000,
      timeoutMs: opts.reviewTimeoutMs ?? 60 * 60 * 1000,
    });
    ctx.adapter.log('info', `review gate: approved ${payload.version}`);
    return payload;
  };
}

const passthroughStage: StageFn = async (input) => input;

function postToPlatformStage(
  name: PlatformName,
  opts: ReleaseAnnounceOptions
): StageFn {
  return async (input, ctx): Promise<PostResult> => {
    const payload = input as FormattedPayload;
    const adapter =
      opts.platformOverrides?.[name] ?? (await resolvePlatform(name));
    const keys = adapter.requiredSecrets();
    const secrets = ctx.adapter.readSecrets(keys);
    ctx.adapter.log('info', `posting to ${name}`);
    const result = await adapter.post(payload.content, secrets);
    if (result.dryRun) {
      ctx.adapter.log('info', `${name}: dry-run ok (${result.postId})`);
    } else {
      ctx.adapter.log('info', `${name}: posted ${result.url}`);
    }
    return result;
  };
}

async function resolvePlatform(name: PlatformName): Promise<PlatformAdapter> {
  switch (name) {
    case 'twitter': return twitterAdapter();
    case 'linkedin': return linkedinAdapter();
    case 'devto': return devtoAdapter();
    default: {
      const _exhaustive: never = name;
      throw new Error(`Unknown platform: ${String(_exhaustive)}`);
    }
  }
}

const collectResultsStage: StageFn = async (input) => {
  return { results: input as Record<string, PostResult | { error: string }> };
};

const logMetricsStage: StageFn = async (input, ctx) => {
  const { results } = input as {
    results: Record<string, PostResult | { error: string }>;
  };
  const successes: string[] = [];
  const failures: string[] = [];
  for (const [platform, r] of Object.entries(results)) {
    if (r && typeof r === 'object' && 'postId' in r) {
      successes.push(platform);
    } else {
      failures.push(platform);
    }
  }
  ctx.adapter.log(
    'info',
    `announce complete: ${successes.length} ok, ${failures.length} failed`
  );
  return { successes, failures, results };
};

function detectRepoUrl(env: Record<string, string | undefined>): string | undefined {
  const repo = env['GITHUB_REPOSITORY'];
  if (!repo) return undefined;
  return `https://github.com/${repo}`;
}
