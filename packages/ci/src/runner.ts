import { randomUUID } from 'node:crypto';
import { FlowChartExecutor } from 'footprintjs';
import { writeTrace } from './persistence/trace-writer.js';
import type { TraceEnvelope } from './persistence/types.js';
import type { Pipeline, RunResult } from './types.js';
import { PACKAGE_VERSION } from './version.js';

export async function runPipeline(pipeline: Pipeline): Promise<RunResult> {
  const { adapter } = pipeline;
  const start = Date.now();
  await adapter.initialize?.();

  let trigger;
  try {
    trigger = await adapter.readTrigger();
  } catch (err) {
    await adapter.finalize?.('failure');
    throw err;
  }

  if (!pipeline.triggers.includes(trigger.event)) {
    adapter.log(
      'info',
      `Skipping: event "${trigger.event}" not in triggers [${pipeline.triggers.join(', ')}]`
    );
    await adapter.finalize?.('success');
    return { status: 'skipped', reason: 'trigger-mismatch' };
  }

  const traceId = randomUUID();

  try {
    const chart = pipeline.flow();
    const executor = new FlowChartExecutor(chart);

    // Narrative recording — produces human-readable causal trace.
    executor.enableNarrative();

    if (pipeline.redaction) {
      executor.setRedactionPolicy(pipeline.redaction);
    }

    const input = pipeline.input ?? trigger;
    const result = await executor.run({
      input,
      env: { traceId, ...(pipeline.timeoutMs ? { timeoutMs: pipeline.timeoutMs } : {}) },
      ...(pipeline.timeoutMs ? { timeoutMs: pipeline.timeoutMs } : {}),
    });

    // Paused: checkpoint the execution and bail out — the host orchestrator
    // is responsible for resuming later.
    if (executor.isPaused()) {
      const checkpoint = executor.getCheckpoint();
      const envelope = buildEnvelope({
        pipeline,
        trigger,
        traceId,
        start,
        executor,
        paused: true,
      });
      const write = await writeTrace(
        { ...envelope, checkpoint },
        pipeline.persistence?.traces
      );
      await persistTrace(pipeline, adapter, write.path, trigger, envelope.version);
      await adapter.finalize?.('success');
      return { status: 'paused', tracePath: write.path, output: checkpoint };
    }

    const envelope = buildEnvelope({
      pipeline,
      trigger,
      traceId,
      start,
      executor,
    });
    const write = await writeTrace(envelope, pipeline.persistence?.traces);

    await persistTrace(pipeline, adapter, write.path, trigger, envelope.version);

    await adapter.finalize?.('success');
    return { status: 'success', tracePath: write.path, output: result };
  } catch (err) {
    const error = err as Error;
    adapter.log('error', `pipeline failed: ${error.message}`);

    try {
      await pipeline.onFailure?.({ error, adapter });
    } catch (handlerErr) {
      adapter.log(
        'error',
        `onFailure handler threw: ${(handlerErr as Error).message}`
      );
    }

    try {
      const envelope: TraceEnvelope = {
        version: trigger.ref ?? 'unknown',
        timestamp: new Date(start).toISOString(),
        durationMs: Date.now() - start,
        flowId: traceId,
        footprintVersion: detectFootprintVersion(),
        ciVersion: PACKAGE_VERSION,
        adapter: adapter.name,
        trigger: {
          event: trigger.event,
          ref: trigger.ref,
          sha: trigger.sha,
          actor: trigger.actor,
        },
        pipeline: { name: pipeline.name, triggers: pipeline.triggers },
        narrative: [],
        narrativeEntries: [],
        snapshot: null,
        error: { message: error.message, stack: error.stack },
      };
      const write = await writeTrace(envelope, pipeline.persistence?.traces);
      await adapter.finalize?.('failure');
      return { status: 'failure', tracePath: write.path, reason: error.message };
    } catch {
      await adapter.finalize?.('failure');
      throw error;
    }
  }
}

interface BuildEnvelopeArgs {
  pipeline: Pipeline;
  trigger: Awaited<ReturnType<Pipeline['adapter']['readTrigger']>>;
  traceId: string;
  start: number;
  executor: FlowChartExecutor;
  paused?: boolean;
}

function buildEnvelope(args: BuildEnvelopeArgs): TraceEnvelope {
  const { pipeline, trigger, traceId, start, executor, paused } = args;
  const snapshot = executor.getSnapshot();
  return {
    version: trigger.ref ?? 'unknown',
    timestamp: new Date(start).toISOString(),
    durationMs: Date.now() - start,
    flowId: traceId,
    footprintVersion: detectFootprintVersion(),
    ciVersion: PACKAGE_VERSION,
    adapter: pipeline.adapter.name,
    trigger: {
      event: trigger.event,
      ref: trigger.ref,
      sha: trigger.sha,
      actor: trigger.actor,
    },
    pipeline: { name: pipeline.name, triggers: pipeline.triggers },
    narrative: executor.getNarrative(),
    narrativeEntries: executor.getNarrativeEntries(),
    snapshot: applySharedStateRedaction(snapshot, pipeline.redaction),
    ...(paused ? { paused: true } : {}),
  };
}

/**
 * FootPrint's `RedactionPolicy` scrubs the commit log and tracked reads/writes,
 * but leaves `snapshot.sharedState` — the live working state — untouched.
 * That's correct for runtime behavior, but unsafe for traces that get
 * committed to a public repo. Apply the same `keys` / `patterns` rules to
 * `sharedState` as a defense-in-depth pass before serialization.
 */
function applySharedStateRedaction(
  snapshot: ReturnType<FlowChartExecutor['getSnapshot']>,
  policy: Pipeline['redaction']
): typeof snapshot {
  if (!snapshot || !policy) return snapshot;
  const keys = new Set(policy.keys ?? []);
  const patterns = policy.patterns ?? [];

  const walk = (value: unknown): unknown => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (keys.has(k) || patterns.some((p) => p.test(k))) {
          out[k] = '[REDACTED]';
        } else {
          out[k] = walk(v);
        }
      }
      return out;
    }
    if (Array.isArray(value)) return value.map(walk);
    return value;
  };

  return {
    ...snapshot,
    sharedState: walk(snapshot.sharedState) as typeof snapshot.sharedState,
  };
}

async function persistTrace(
  pipeline: Pipeline,
  adapter: Pipeline['adapter'],
  path: string,
  trigger: Awaited<ReturnType<Pipeline['adapter']['readTrigger']>>,
  version: string
): Promise<void> {
  if (pipeline.persistence?.traces?.uploadAsArtifact) {
    try {
      await adapter.uploadArtifact({
        path,
        name: `trace-${trigger.ref ?? version}`,
        ...(pipeline.persistence.traces.retentionDays
          ? { retentionDays: pipeline.persistence.traces.retentionDays }
          : {}),
      });
    } catch (err) {
      adapter.log('warn', `artifact upload failed: ${(err as Error).message}`);
    }
  }
  if (pipeline.persistence?.traces?.commitBack) {
    try {
      await adapter.commitToRepo({
        path,
        message: `chore(trace): ${trigger.ref ?? version}`,
      });
    } catch (err) {
      adapter.log('warn', `commit-back failed: ${(err as Error).message}`);
    }
  }
}

function detectFootprintVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('footprintjs/package.json').version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
