import type { PlatformAdapter } from './types';

/**
 * LinkedIn platform adapter — stub for v0.2.
 *
 * @throws Always — not yet implemented.
 */
export async function linkedinAdapter(): Promise<PlatformAdapter> {
  throw new Error(
    'LinkedIn platform adapter is not yet available. Planned for v0.2.'
  );
}
