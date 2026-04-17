import type { RunnableFlowChart } from 'footprintjs';
import type { RedactionPolicy } from 'footprintjs';
import type { CIAdapter, TriggerEvent } from './adapters/types.js';

export type { RedactionPolicy };

export interface TraceStorageConfig {
  dir?: string;
  uploadAsArtifact?: boolean;
  commitBack?: boolean;
  retentionDays?: number;
  maxSizeBytes?: number;
}

export interface PersistenceConfig {
  traces?: TraceStorageConfig;
}

export interface FailureHandlerContext {
  error: Error;
  adapter: CIAdapter;
}

export type FailureHandler = (ctx: FailureHandlerContext) => Promise<void> | void;

/**
 * Builds a FootPrint FlowChart. Called by the runner after the trigger has
 * been read. Return the result of `.build()` on a `flowChart(...)` builder.
 */
export type FlowFactory = () => RunnableFlowChart<any, any>;

/**
 * A pipeline module — a reusable chunk that either builds a full chart or
 * returns an `apply(builder)` callback for composition with other modules.
 */
export interface PipelineModule {
  readonly name: string;
  build(): RunnableFlowChart<any, any>;
}

export interface PipelineConfig {
  name: string;
  adapter: CIAdapter;
  triggers: TriggerEvent[];
  /** Builds the flow chart. Invoked once per run, after the trigger is read. */
  flow: FlowFactory;
  persistence?: PersistenceConfig;
  redaction?: RedactionPolicy;
  onFailure?: FailureHandler;
  /** Runtime input surfaced via `scope.$getArgs()`. Defaults to the trigger. */
  input?: unknown;
  /** Timeout for the underlying FlowChartExecutor.run(). */
  timeoutMs?: number;
}

export interface Pipeline {
  readonly name: string;
  readonly adapter: CIAdapter;
  readonly triggers: TriggerEvent[];
  readonly flow: FlowFactory;
  readonly persistence?: PersistenceConfig;
  readonly redaction?: RedactionPolicy;
  readonly onFailure?: FailureHandler;
  readonly input?: unknown;
  readonly timeoutMs?: number;
}

export interface RunResult {
  status: 'success' | 'failure' | 'skipped' | 'paused';
  reason?: string;
  tracePath?: string;
  output?: unknown;
}
