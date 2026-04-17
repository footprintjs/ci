import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockAdapter, pipeline, runPipeline } from '@footprintjs/ci';
import { releaseAnnounce } from '../src/module';
import type {
  FormattedContent,
  PlatformAdapter,
  PostResult,
} from '../src/platforms/types';

function fakeTwitter(): PlatformAdapter & { calls: FormattedContent[] } {
  const calls: FormattedContent[] = [];
  return {
    name: 'twitter',
    limits: { maxLength: 280, supportsMarkdown: false, supportsImages: true },
    requiredSecrets: () => ['TWITTER_API_KEY'],
    calls,
    async post(content: FormattedContent): Promise<PostResult> {
      calls.push(content);
      return {
        platform: 'twitter',
        postId: 'fake-123',
        url: 'https://twitter.com/i/web/status/fake-123',
        postedAt: new Date().toISOString(),
      };
    },
  };
}

describe('releaseAnnounce module (integration)', () => {
  let traceDir: string;

  beforeEach(() => {
    traceDir = mkdtempSync(join(tmpdir(), 'ra-'));
  });
  afterEach(() => {
    rmSync(traceDir, { recursive: true, force: true });
  });

  it('runs end-to-end on a minor release (auto branch), posts to twitter', async () => {
    const tw = fakeTwitter();
    const adapter = new MockAdapter({
      trigger: {
        event: 'release.published',
        ref: 'v1.2.0',
        payload: {
          release: {
            tag_name: 'v1.2.0',
            body: '### Features\n- do a thing\n\n### Fixes\n- squash bug',
          },
        },
      },
      secrets: { TWITTER_API_KEY: 'fake' },
    });

    const announce = releaseAnnounce({
      platforms: ['twitter'],
      platformOverrides: { twitter: tw },
    });

    const p = pipeline({
      name: 'announce-test',
      adapter,
      triggers: ['release.published'],
      flow: () => announce.build(),
      persistence: { traces: { dir: traceDir } },
    });

    const result = await runPipeline(p);
    expect(result.status).toBe('success');
    expect(tw.calls).toHaveLength(1);
    expect(tw.calls[0]!.text).toContain('v1.2.0');
    expect(tw.calls[0]!.text).toContain('do a thing');

    // Trace contains FootPrint's causal narrative (keyed on stage names in
    // structured entries, not the free-text lines).
    const trace = JSON.parse(readFileSync(result.tracePath!, 'utf8'));
    expect(trace.narrative.length).toBeGreaterThan(0);
    const stageNames = trace.narrativeEntries
      .filter((e: { type: string }) => e.type === 'stage')
      .map((e: { stageName: string }) => e.stageName);
    expect(stageNames).toContain('ParseChangelog');
    expect(stageNames).toContain('FormatContent');
    expect(stageNames).toContain('PostToTwitter');
  });

  it('major-version review gate routes through the manual branch', async () => {
    const tw = fakeTwitter();
    let approved = false;
    const adapter = new MockAdapter({
      trigger: {
        event: 'release.published',
        ref: 'v2.0.0',
        payload: {
          release: { tag_name: 'v2.0.0', body: '### Features\n- ship v2' },
        },
      },
    });

    const announce = releaseAnnounce({
      platforms: ['twitter'],
      manualReviewOn: 'major',
      platformOverrides: { twitter: tw },
      reviewIntervalMs: 1,
      reviewTimeoutMs: 5000,
      approvalProbe: async () => {
        const was = approved;
        approved = true;
        return was;
      },
    });

    const p = pipeline({
      name: 'announce-test-major',
      adapter,
      triggers: ['release.published'],
      flow: () => announce.build(),
      persistence: { traces: { dir: traceDir } },
    });

    const result = await runPipeline(p);
    expect(result.status).toBe('success');
    expect(tw.calls).toHaveLength(1);
    // Narrative should show the manual branch was taken.
    const trace = JSON.parse(readFileSync(result.tracePath!, 'utf8'));
    const stageNames = trace.narrativeEntries
      .filter((e: { type: string }) => e.type === 'stage')
      .map((e: { stageName: string }) => e.stageName);
    expect(stageNames).toContain('WaitForApproval');
  });

  it('dry-run path produces a dryRun result and records it in the trace', async () => {
    process.env.DRY_RUN = '1';
    try {
      const adapter = new MockAdapter({
        trigger: {
          event: 'release.published',
          ref: 'v1.0.1',
          payload: {
            release: { tag_name: 'v1.0.1', body: '### Fixes\n- small fix' },
          },
        },
      });
      const announce = releaseAnnounce({ platforms: ['twitter'] });
      const p = pipeline({
        name: 'announce-dry',
        adapter,
        triggers: ['release.published'],
        flow: () => announce.build(),
        persistence: { traces: { dir: traceDir } },
      });
      const r = await runPipeline(p);
      expect(r.status).toBe('success');
      const text = readFileSync(r.tracePath!, 'utf8');
      expect(text).toMatch(/dryrun-/);
    } finally {
      delete process.env.DRY_RUN;
    }
  });
});
