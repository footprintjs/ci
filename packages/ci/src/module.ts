import type { RunnableFlowChart } from 'footprintjs';
import type { PipelineModule } from './types.js';

/**
 * Create a reusable pipeline module. A module wraps a `build()` function that
 * returns a `RunnableFlowChart` — the result of `flowChart(...).build()`.
 *
 * @example
 *   const announce = module('announce', () =>
 *     flowChart<State>('Parse', parseFn, 'parse')
 *       .addFunction('Format', formatFn, 'format')
 *       .build()
 *   );
 *
 *   pipeline({ flow: () => announce.build(), ... });
 */
export function module(
  name: string,
  build: () => RunnableFlowChart<any, any>
): PipelineModule {
  return { name, build };
}
