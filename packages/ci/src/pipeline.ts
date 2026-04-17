import type { Pipeline, PipelineConfig } from './types.js';

/**
 * Define a pipeline. The `flow` callback builds and returns a FootPrint
 * `RunnableFlowChart` (the output of `.build()` on `flowChart(...)`).
 */
export function pipeline(config: PipelineConfig): Pipeline {
  return {
    name: config.name,
    adapter: config.adapter,
    triggers: config.triggers,
    flow: config.flow,
    persistence: config.persistence,
    redaction: config.redaction,
    onFailure: config.onFailure,
    input: config.input,
    timeoutMs: config.timeoutMs,
  };
}
