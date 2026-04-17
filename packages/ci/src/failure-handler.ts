import type { FailureHandler, FailureHandlerContext } from './types.js';

/**
 * Wrap a user function as a `FailureHandler`. Primarily exists so the public
 * API reads nicely (`onFailure(async ({ error, adapter }) => { ... })`), and
 * so future versions can attach middleware without breaking callers.
 */
export function onFailure(
  fn: (ctx: FailureHandlerContext) => Promise<void> | void
): FailureHandler {
  return async (ctx) => {
    await fn(ctx);
  };
}
