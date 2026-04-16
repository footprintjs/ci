import type {
  DeciderFn,
  FlowDefinition,
  FlowNode,
  FootPrintBuilder,
  RetryPolicy,
  StageFn,
} from './types';

class Builder implements FootPrintBuilder {
  private nodes: FlowNode[] = [];
  private pendingDecider: FlowNode | null = null;

  stage<I = unknown, O = unknown>(
    name: string,
    fn: StageFn<I, O> | FlowDefinition,
    retry?: RetryPolicy
  ): FootPrintBuilder {
    const stageFn = isFlowDefinition(fn) ? runSubFlow(fn) : (fn as StageFn);
    this.nodes.push({ kind: 'stage', name, fn: stageFn, retry });
    return this;
  }

  decider<I = unknown>(name: string, fn: DeciderFn<I>): FootPrintBuilder {
    const node: FlowNode = {
      kind: 'decider',
      name,
      fn: fn as DeciderFn,
      branches: new Map(),
    };
    this.nodes.push(node);
    this.pendingDecider = node;
    return this;
  }

  branch(name: string, fn: StageFn | FlowDefinition): FootPrintBuilder {
    if (!this.pendingDecider || this.pendingDecider.kind !== 'decider') {
      throw new Error(
        `branch("${name}") must be called immediately after decider()`
      );
    }
    const stageFn = isFlowDefinition(fn) ? runSubFlow(fn) : fn;
    this.pendingDecider.branches.set(name, [
      { kind: 'stage', name: `${this.pendingDecider.name}:${name}`, fn: stageFn },
    ]);
    return this;
  }

  fork(
    branches: Array<{
      name: string;
      stage: StageFn | FlowDefinition;
      retry?: RetryPolicy;
    }>
  ): FootPrintBuilder {
    this.pendingDecider = null;
    this.nodes.push({
      kind: 'fork',
      name: 'fork',
      branches: branches.map((b) => ({
        name: b.name,
        fn: isFlowDefinition(b.stage) ? runSubFlow(b.stage) : b.stage,
        retry: b.retry,
      })),
    });
    return this;
  }

  join(name: string, fn: StageFn): FootPrintBuilder {
    this.nodes.push({ kind: 'join', name, fn });
    return this;
  }

  build(): FlowDefinition {
    return { nodes: this.nodes.slice() };
  }
}

function isFlowDefinition(v: unknown): v is FlowDefinition {
  return (
    typeof v === 'object' &&
    v !== null &&
    Array.isArray((v as FlowDefinition).nodes)
  );
}

function runSubFlow(def: FlowDefinition): StageFn {
  return async (input, ctx) => {
    const { runFlow } = await import('./runner');
    const { output } = await runFlow(def, input, ctx);
    return output;
  };
}

export function createBuilder(): FootPrintBuilder {
  return new Builder();
}
