import type { PlatformAdapter } from './types.js';

/**
 * dev.to platform adapter — stub for v0.3.
 *
 * @throws Always — not yet implemented.
 */
export async function devtoAdapter(): Promise<PlatformAdapter> {
  throw new Error(
    'dev.to platform adapter is not yet available. Planned for v0.3.'
  );
}
