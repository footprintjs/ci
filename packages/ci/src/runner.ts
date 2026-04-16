import { randomUUID } from 'node:crypto';
import { runFlow, FlowRecorder } from './internal/flow';
import { redact } from './redaction';
import { writeTrace } from './persistence/trace-writer';
import type { TraceEnvelope } from './persistence/types';
import type { Pipeline, RunResult } from './types';
import { PACKAGE_VERSION } from './version';

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

  const recorder = new FlowRecorder();
  const flowId = randomUUID();

  try {
    const def = pipeline.buildFlow();
    const ctx = { trigger, adapter, env: { ...process.env } };
    const { output } = await runFlow(def, trigger, ctx, { recorder });

    const record = recorder.export();
    const { value: redactedStages, report: stagesReport } = redact(
      record.stages,
      pipeline.redaction
    );
    const { value: redactedForks, report: forksReport } = redact(
      record.forks,
      pipeline.redaction
    );

    const envelope: TraceEnvelope = {
      version: trigger.ref ?? 'unknown',
      timestamp: new Date(start).toISOString(),
      durationMs: Date.now() - start,
      flowId,
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
      stages: redactedStages as unknown[],
      forks: redactedForks as unknown[],
      redactionReport: {
        matchCount: stagesReport.matchCount + forksReport.matchCount,
        patternsFired: Array.from(
          new Set([...stagesReport.patternsFired, ...forksReport.patternsFired])
        ),
        envVarsFired: Array.from(
          new Set([...stagesReport.envVarsFired, ...forksReport.envVarsFired])
        ),
      },
    };

    warnOnResidualSecrets(envelope, adapter, pipeline.redaction?.patterns);

    const write = await writeTrace(envelope, pipeline.persistence?.traces);

    if (pipeline.persistence?.traces?.uploadAsArtifact) {
      try {
        await adapter.uploadArtifact({
          path: write.path,
          name: `trace-${envelope.trigger.ref ?? envelope.flowId}`,
          retentionDays: pipeline.persistence.traces.retentionDays,
        });
      } catch (err) {
        adapter.log('warn', `artifact upload failed: ${(err as Error).message}`);
      }
    }
    if (pipeline.persistence?.traces?.commitBack) {
      try {
        await adapter.commitToRepo({
          path: write.path,
          message: `chore(trace): ${envelope.trigger.ref ?? envelope.flowId}`,
        });
      } catch (err) {
        adapter.log('warn', `commit-back failed: ${(err as Error).message}`);
      }
    }

    await adapter.finalize?.('success');
    return { status: 'success', tracePath: write.path, output };
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

    // Write a failure trace so the error is observable even without the handler.
    try {
      const record = recorder.export();
      const { value: redactedStages } = redact(record.stages, pipeline.redaction);
      const { value: redactedForks } = redact(record.forks, pipeline.redaction);
      const envelope: TraceEnvelope = {
        version: trigger.ref ?? 'unknown',
        timestamp: new Date(start).toISOString(),
        durationMs: Date.now() - start,
        flowId,
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
        stages: redactedStages as unknown[],
        forks: redactedForks as unknown[],
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

function detectFootprintVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('footprintjs/package.json').version ?? 'unknown';
  } catch {
    return 'embedded';
  }
}

function warnOnResidualSecrets(
  envelope: TraceEnvelope,
  adapter: { log: (l: 'info' | 'warn' | 'error', m: string) => void },
  patterns: RegExp[] | undefined
): void {
  if (!patterns || patterns.length === 0) return;
  const serialized = JSON.stringify(envelope);
  for (const pat of patterns) {
    const test = new RegExp(pat.source, pat.flags);
    if (test.test(serialized)) {
      adapter.log(
        'warn',
        `redaction safety net: pattern /${pat.source}/ still matched output after redaction`
      );
    }
  }
}
