const MAJOR_RE = /^v?(\d+)\.0\.0(?:[-+].*)?$/;

/**
 * True if `version` looks like a major bump (e.g. `v2.0.0`, `1.0.0-rc.1`).
 */
export function isMajorVersion(version: string): boolean {
  const m = version.match(MAJOR_RE);
  if (!m) return false;
  const major = Number(m[1] ?? '0');
  return major > 0;
}

export type ReviewMode = 'major' | 'none';

export function reviewBranchFor(
  version: string,
  mode: ReviewMode
): 'manual' | 'auto' {
  if (mode === 'major' && isMajorVersion(version)) return 'manual';
  return 'auto';
}

export interface WaitForApprovalOptions {
  /** ms between polls. Default: 30_000. */
  intervalMs?: number;
  /** Max ms to wait before giving up. Default: 1h (3_600_000). */
  timeoutMs?: number;
  /** Now source — injectable for tests. */
  now?: () => number;
  /** Sleep source — injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Poll function. Return `true` once an `/approve` comment has been seen. */
  isApproved: () => Promise<boolean>;
}

export async function waitForApproval(opts: WaitForApprovalOptions): Promise<void> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const timeoutMs = opts.timeoutMs ?? 60 * 60 * 1000;
  const intervalMs = opts.intervalMs ?? 30_000;

  const start = now();
  // Check once immediately — skip sleep on the first iteration.
  if (await opts.isApproved()) return;

  while (now() - start < timeoutMs) {
    await sleep(intervalMs);
    if (await opts.isApproved()) return;
  }

  throw new Error(
    `Review gate timed out after ${timeoutMs}ms without an /approve comment`
  );
}
