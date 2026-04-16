import { describe, expect, it } from 'vitest';
import {
  isMajorVersion,
  reviewBranchFor,
  waitForApproval,
} from '../src/review-gate';

describe('isMajorVersion', () => {
  it('true for v1.0.0, v2.0.0, 3.0.0', () => {
    expect(isMajorVersion('v1.0.0')).toBe(true);
    expect(isMajorVersion('v2.0.0')).toBe(true);
    expect(isMajorVersion('3.0.0')).toBe(true);
  });
  it('false for 0.x, minor, patch', () => {
    expect(isMajorVersion('v0.1.0')).toBe(false);
    expect(isMajorVersion('v1.2.0')).toBe(false);
    expect(isMajorVersion('v1.0.1')).toBe(false);
  });
  it('handles prereleases on majors', () => {
    expect(isMajorVersion('v2.0.0-rc.1')).toBe(true);
  });
});

describe('reviewBranchFor', () => {
  it('returns manual when mode=major and version is major', () => {
    expect(reviewBranchFor('v2.0.0', 'major')).toBe('manual');
  });
  it('returns auto when mode=major but version is minor', () => {
    expect(reviewBranchFor('v1.3.0', 'major')).toBe('auto');
  });
  it('returns auto when mode=none', () => {
    expect(reviewBranchFor('v2.0.0', 'none')).toBe('auto');
  });
});

describe('waitForApproval', () => {
  it('returns immediately when first probe is approved', async () => {
    await expect(
      waitForApproval({ isApproved: async () => true })
    ).resolves.toBeUndefined();
  });

  it('polls until approved', async () => {
    let calls = 0;
    await waitForApproval({
      isApproved: async () => ++calls >= 3,
      intervalMs: 1,
      timeoutMs: 1000,
      sleep: async () => { /* no-op */ },
    });
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  it('times out if never approved', async () => {
    let t = 0;
    const now = () => { t += 500; return t; };
    await expect(
      waitForApproval({
        isApproved: async () => false,
        intervalMs: 1,
        timeoutMs: 1000,
        now,
        sleep: async () => { /* no-op */ },
      })
    ).rejects.toThrow(/timed out/);
  });
});
