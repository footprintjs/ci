import { describe, expect, it } from 'vitest';
import type { CIAdapter } from '../src/adapters/types';

/**
 * Shared contract suite. Runs against MockAdapter AND GitHubActionsAdapter.
 *
 * Contract rules:
 * - `readTrigger()` returns a Trigger shape with at minimum `event`.
 * - `readSecrets` returns `undefined` (not throw) for missing keys.
 * - `log()` is synchronous and does not throw.
 * - `uploadArtifact` / `commitToRepo` accept options and resolve (or
 *   fail gracefully when underlying capability is missing).
 */
export function runAdapterContract(
  name: string,
  factory: () => Promise<CIAdapter> | CIAdapter
): void {
  describe(`${name} (CIAdapter contract)`, () => {
    it('exposes a stable name', async () => {
      const a = await factory();
      expect(typeof a.name).toBe('string');
      expect(a.name.length).toBeGreaterThan(0);
    });

    it('readTrigger resolves to a Trigger with an event', async () => {
      const a = await factory();
      const t = await a.readTrigger();
      expect(t.event).toBeDefined();
    });

    it('readSecrets returns undefined for missing keys (never throws)', async () => {
      const a = await factory();
      const r = a.readSecrets(['__definitely_missing_' + Date.now()] as const);
      expect(Object.values(r)[0]).toBeUndefined();
    });

    it('log() does not throw for any level', async () => {
      const a = await factory();
      expect(() => a.log('info', 'x')).not.toThrow();
      expect(() => a.log('warn', 'x')).not.toThrow();
      expect(() => a.log('error', 'x')).not.toThrow();
    });
  });
}
