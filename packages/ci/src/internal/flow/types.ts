/**
 * Internal flow engine types.
 *
 * These mirror the shape of the external `footprintjs` package. When
 * `footprintjs` becomes a real published dependency, this internal engine
 * can be swapped for it without changing the public API of `@footprintjs/ci`.
 */

export interface FlowContext {
  trigger: import('../../adapters/types').Trigger;
  adapter: import('../../adapters/types').CIAdapter;
  env: Record<string, string | undefined>;
}

export type StageFn<Input = unknown, Output = unknown> = (
  input: Input,
  ctx: FlowContext
) => Promise<Output> | Output;

export type DeciderFn<Input = unknown> = (
  input: Input,
  ctx: FlowContext
) => Promise<string> | string;

export interface RetryPolicy {
  maxAttempts: number;
  backoff?: 'fixed' | 'exponential';
  initialDelayMs?: number;
}

export interface StageNode {
  kind: 'stage';
  name: string;
  fn: StageFn;
  retry?: RetryPolicy;
}

export interface DeciderNode {
  kind: 'decider';
  name: string;
  fn: DeciderFn;
  branches: Map<string, FlowNode[]>;
}

export interface ForkNode {
  kind: 'fork';
  name: string;
  branches: Array<{ name: string; fn: StageFn; retry?: RetryPolicy }>;
}

export interface JoinNode {
  kind: 'join';
  name: string;
  fn: StageFn;
}

export type FlowNode = StageNode | DeciderNode | ForkNode | JoinNode;

export interface FlowDefinition {
  nodes: FlowNode[];
}

/**
 * Builder surface consumed by user-supplied `flow` callbacks.
 */
export interface FootPrintBuilder {
  stage<I = unknown, O = unknown>(
    name: string,
    fn: StageFn<I, O> | FlowDefinition,
    retry?: RetryPolicy
  ): FootPrintBuilder;

  decider<I = unknown>(name: string, fn: DeciderFn<I>): FootPrintBuilder;

  branch(name: string, fn: StageFn | FlowDefinition): FootPrintBuilder;

  fork(
    branches: Array<{
      name: string;
      stage: StageFn | FlowDefinition;
      retry?: RetryPolicy;
    }>
  ): FootPrintBuilder;

  join(name: string, fn: StageFn): FootPrintBuilder;

  build(): FlowDefinition;
}

export interface StageTrace {
  name: string;
  kind: FlowNode['kind'];
  startedAt: string;
  durationMs: number;
  status: 'success' | 'failure' | 'skipped';
  retries?: number;
  output?: unknown;
  error?: { message: string; stack?: string };
}

export interface ForkTrace {
  name: string;
  parallel: true;
  results: Record<string, 'success' | 'failure'>;
  stages: StageTrace[];
}

export interface FlowRecord {
  stages: StageTrace[];
  forks: ForkTrace[];
}
