import type {
  FlowContext,
  FlowDefinition,
  FlowNode,
  ForkNode,
  RetryPolicy,
  StageFn,
  StageTrace,
} from './types';
import { FlowRecorder } from './recorder';

export interface RunOptions {
  recorder?: FlowRecorder;
}

export interface RunResult {
  output: unknown;
}

export async function runFlow(
  def: FlowDefinition,
  input: unknown,
  ctx: FlowContext,
  opts: RunOptions = {}
): Promise<RunResult> {
  let current: unknown = input;
  let i = 0;
  while (i < def.nodes.length) {
    const node = def.nodes[i]!;

    if (node.kind === 'stage') {
      current = await executeStage(node.name, node.fn, node.retry, current, ctx, opts.recorder, 'stage');
    } else if (node.kind === 'decider') {
      const branchName = await node.fn(current, ctx);
      const branchNodes = node.branches.get(branchName);
      if (!branchNodes) {
        throw new Error(
          `decider "${node.name}" returned "${branchName}" but no matching branch was defined`
        );
      }
      const branchDef: FlowDefinition = { nodes: branchNodes };
      const { output } = await runFlow(branchDef, current, ctx, opts);
      current = output;
    } else if (node.kind === 'fork') {
      current = await executeFork(node, current, ctx, opts.recorder);
    } else if (node.kind === 'join') {
      current = await executeStage(node.name, node.fn, undefined, current, ctx, opts.recorder, 'join');
    }

    i++;
  }
  return { output: current };
}

async function executeStage(
  name: string,
  fn: StageFn,
  retry: RetryPolicy | undefined,
  input: unknown,
  ctx: FlowContext,
  recorder: FlowRecorder | undefined,
  kind: FlowNode['kind']
): Promise<unknown> {
  const start = Date.now();
  const startedAt = new Date(start).toISOString();
  const maxAttempts = retry?.maxAttempts ?? 1;
  let attempt = 0;
  let lastError: Error | undefined;

  while (attempt < maxAttempts) {
    try {
      const output = await fn(input, ctx);
      recorder?.recordStage({
        name,
        kind,
        startedAt,
        durationMs: Date.now() - start,
        status: 'success',
        retries: attempt,
        output: summarize(output),
      });
      return output;
    } catch (err) {
      lastError = err as Error;
      attempt++;
      if (attempt >= maxAttempts) break;
      const delay = computeDelay(retry, attempt);
      await sleep(delay);
    }
  }

  recorder?.recordStage({
    name,
    kind,
    startedAt,
    durationMs: Date.now() - start,
    status: 'failure',
    retries: attempt - 1,
    error: {
      message: lastError?.message ?? 'unknown',
      stack: lastError?.stack,
    },
  });
  throw lastError;
}

async function executeFork(
  node: ForkNode,
  input: unknown,
  ctx: FlowContext,
  recorder: FlowRecorder | undefined
): Promise<Record<string, unknown>> {
  const stageTraces: StageTrace[] = [];
  const results: Record<string, 'success' | 'failure'> = {};
  const localRecorder = {
    recordStage: (t: StageTrace) => {
      stageTraces.push(t);
      recorder?.recordStage(t);
    },
  } as FlowRecorder;

  const settled = await Promise.allSettled(
    node.branches.map(async (branch) => {
      try {
        const out = await executeStage(
          branch.name,
          branch.fn,
          branch.retry,
          input,
          ctx,
          localRecorder,
          'stage'
        );
        results[branch.name] = 'success';
        return { name: branch.name, output: out };
      } catch (err) {
        results[branch.name] = 'failure';
        throw err;
      }
    })
  );

  recorder?.recordFork({
    name: node.name,
    parallel: true,
    results,
    stages: stageTraces,
  });

  const out: Record<string, unknown> = {};
  settled.forEach((r, idx) => {
    const bname = node.branches[idx]!.name;
    if (r.status === 'fulfilled') {
      out[bname] = r.value.output;
    } else {
      out[bname] = { error: (r.reason as Error).message };
    }
  });
  return out;
}

function computeDelay(retry: RetryPolicy | undefined, attempt: number): number {
  if (!retry) return 0;
  const base = retry.initialDelayMs ?? 100;
  if (retry.backoff === 'exponential') {
    return base * 2 ** (attempt - 1);
  }
  return base;
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function summarize(output: unknown): unknown {
  if (output == null) return output;
  if (typeof output !== 'object') return output;
  // Shallow copy so the recorder holds a stable snapshot.
  try {
    return JSON.parse(JSON.stringify(output));
  } catch {
    return '[unserializable]';
  }
}
