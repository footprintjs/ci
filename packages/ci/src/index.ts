// Core
export { pipeline } from './pipeline';
export { module } from './module';
export { onFailure } from './failure-handler';
export { runPipeline } from './runner';

// Adapters (built-in)
export { githubActions } from './adapters/github-actions';
export { MockAdapter } from './adapters/mock';

// Extensibility
export type {
  CIAdapter,
  CommitToRepoOptions,
  LogLevel,
  Trigger,
  TriggerEvent,
  UploadArtifactOptions,
} from './adapters/types';
export type {
  FailureHandler,
  FailureHandlerContext,
  FlowFactory,
  PersistenceConfig,
  Pipeline,
  PipelineConfig,
  PipelineModule,
  RunResult,
  TraceStorageConfig,
} from './types';
export type {
  FootPrintBuilder,
  FlowRecord,
  StageTrace,
  ForkTrace,
  RetryPolicy,
  StageFn,
  DeciderFn,
} from './internal/flow';

// Redaction
export { presetRedactionPolicies, REDACTED, redact } from './redaction';
export type { RedactionPolicy, RedactionReport } from './redaction';

// Versioning
export { PACKAGE_VERSION } from './version';
