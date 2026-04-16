import { createBuilder } from './internal/flow';
import type { FlowDefinition } from './internal/flow';
import type { Pipeline, PipelineConfig } from './types';

export function pipeline(config: PipelineConfig): Pipeline {
  const buildFlow = (): FlowDefinition => {
    const builder = createBuilder();
    const built = config.flow(builder);
    return built.build();
  };

  return {
    name: config.name,
    adapter: config.adapter,
    triggers: config.triggers,
    flow: config.flow,
    persistence: config.persistence,
    redaction: config.redaction,
    onFailure: config.onFailure,
    buildFlow,
  };
}
