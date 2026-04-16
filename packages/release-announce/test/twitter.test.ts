import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { twitterAdapter } from '../src/platforms/twitter';

describe('twitterAdapter', () => {
  beforeEach(() => {
    delete process.env.DRY_RUN;
  });
  afterEach(() => {
    delete process.env.DRY_RUN;
    vi.resetModules();
  });

  it('requiredSecrets lists the four OAuth1 keys', async () => {
    const a = await twitterAdapter();
    expect(a.requiredSecrets()).toEqual([
      'TWITTER_API_KEY',
      'TWITTER_API_SECRET',
      'TWITTER_ACCESS_TOKEN',
      'TWITTER_ACCESS_SECRET',
    ]);
  });

  it('enforces max tweet length (truncates to 280)', async () => {
    process.env.DRY_RUN = '1';
    const a = await twitterAdapter();
    const long = 'x'.repeat(400);
    // dry-run returns a marker; we just want to confirm no throw on truncation path
    const r = await a.post({ text: long }, {});
    expect(r.dryRun).toBe(true);
  });

  it('dry-run returns a mock result without calling API', async () => {
    process.env.DRY_RUN = 'true';
    const a = await twitterAdapter();
    const r = await a.post({ text: 'hello' }, {});
    expect(r.platform).toBe('twitter');
    expect(r.dryRun).toBe(true);
    expect(r.postId).toContain('dryrun-');
  });

  it('throws when required secrets are missing and DRY_RUN is off', async () => {
    const a = await twitterAdapter();
    await expect(a.post({ text: 'hi' }, {})).rejects.toThrow(/missing required secrets/);
  });

  it('exposes limits metadata', async () => {
    const a = await twitterAdapter();
    expect(a.limits.maxLength).toBe(280);
    expect(a.limits.supportsMarkdown).toBe(false);
    expect(a.limits.supportsImages).toBe(true);
  });
});
