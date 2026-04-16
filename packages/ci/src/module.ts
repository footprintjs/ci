import type { FootPrintBuilder } from './internal/flow';
import type { PipelineModule } from './types';

/**
 * Create a reusable pipeline module — a named wrapper around a builder
 * transformation that can be embedded in a larger flow.
 *
 * @example
 *   const announce = module('announce', (fp) =>
 *     fp.stage('tweet', tweetStage).stage('post', postStage)
 *   );
 */
export function module(
  name: string,
  apply: (fp: FootPrintBuilder) => FootPrintBuilder
): PipelineModule {
  return { name, apply };
}
