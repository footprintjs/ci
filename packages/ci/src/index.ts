// Core
export { pipeline } from './pipeline.js';
export { module } from './module.js';
export { onFailure } from './failure-handler.js';
export { runPipeline } from './runner.js';

// Adapters (built-in)
export { githubActions } from './adapters/github-actions/index.js';
export { MockAdapter } from './adapters/mock.js';

// Public types
export type {
  CIAdapter,
  CommitToRepoOptions,
  LogLevel,
  Trigger,
  TriggerEvent,
  UploadArtifactOptions,
} from './adapters/types.js';
export type {
  FailureHandler,
  FailureHandlerContext,
  FlowFactory,
  PersistenceConfig,
  Pipeline,
  PipelineConfig,
  PipelineModule,
  RedactionPolicy,
  RunResult,
  TraceStorageConfig,
} from './types.js';

// Re-export FootPrint essentials so consumers don't need two imports for the
// common case. Keeps `.footprint-ci.ts` configs tidy.
export {
  FlowChartExecutor,
  decide,
  flowChart,
  select,
} from 'footprintjs';
export type {
  CombinedNarrativeEntry,
  DecideRule,
  DecisionEvidence,
  ExecutionEnv,
  ExecutorResult,
  FlowChart,
  PausableHandler,
  RunOptions,
  RunnableFlowChart,
  RuntimeSnapshot,
  StageHandler,
  TypedScope,
} from 'footprintjs';

export { PACKAGE_VERSION } from './version.js';
