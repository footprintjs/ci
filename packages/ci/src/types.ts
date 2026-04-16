import type { CIAdapter, TriggerEvent } from './adapters/types';
import type { FlowDefinition, FootPrintBuilder } from './internal/flow';
import type { RedactionPolicy } from './redaction';

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

export interface PipelineModule {
  name: string;
  apply: (fp: FootPrintBuilder) => FootPrintBuilder;
}

export type FlowFactory = (fp: FootPrintBuilder) => FootPrintBuilder;

export interface PipelineConfig {
  name: string;
  adapter: CIAdapter;
  triggers: TriggerEvent[];
  flow: FlowFactory;
  persistence?: PersistenceConfig;
  redaction?: RedactionPolicy;
  onFailure?: FailureHandler;
}

export interface Pipeline {
  readonly name: string;
  readonly adapter: CIAdapter;
  readonly triggers: TriggerEvent[];
  readonly flow: FlowFactory;
  readonly persistence?: PersistenceConfig;
  readonly redaction?: RedactionPolicy;
  readonly onFailure?: FailureHandler;
  /** Internal: build the flow tree. */
  buildFlow(): FlowDefinition;
}

export interface RunResult {
  status: 'success' | 'failure' | 'skipped';
  reason?: string;
  tracePath?: string;
  output?: unknown;
}
