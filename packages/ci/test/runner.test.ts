import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { flowChart } from 'footprintjs';
import { pipeline } from '../src/pipeline';
import { runPipeline } from '../src/runner';
import { MockAdapter } from '../src/adapters/mock';
import { onFailure } from '../src/failure-handler';

interface State {
  status: string;
}

describe('runPipeline', () => {
  let traceDir: string;

  beforeEach(() => {
    traceDir = mkdtempSync(join(tmpdir(), 'fpci-'));
  });
  afterEach(() => {
    rmSync(traceDir, { recursive: true, force: true });
  });

  it('skips when trigger.event is not in triggers[]', async () => {
    const adapter = new MockAdapter({ trigger: { event: 'push' } });
    const p = pipeline({
      name: 'test',
      adapter,
      triggers: ['release.published'],
      flow: () =>
        flowChart<State>('Never', (s) => { s.status = 'never'; }, 'never').build(),
      persistence: { traces: { dir: traceDir } },
    });
    const r = await runPipeline(p);
    expect(r.status).toBe('skipped');
    expect(r.reason).toBe('trigger-mismatch');
    expect(adapter.calls.finalized).toEqual(['success']);
  });

  it('runs a simple chart end-to-end and writes a trace with narrative', async () => {
    const adapter = new MockAdapter({
      trigger: { event: 'release.published', ref: 'v1.0.0' },
    });
    const p = pipeline({
      name: 'test',
      adapter,
      triggers: ['release.published'],
      flow: () =>
        flowChart<State>('Init', (scope) => {
          scope.status = 'ok';
        }, 'init')
          .addFunction('Finalize', (scope) => {
            scope.status = `${scope.status}-finalized`;
          }, 'finalize')
          .build(),
      persistence: { traces: { dir: traceDir } },
    });
    const r = await runPipeline(p);
    expect(r.status).toBe('success');
    expect(r.tracePath).toBeDefined();
    const trace = JSON.parse(readFileSync(r.tracePath!, 'utf8'));
    expect(trace.pipeline.name).toBe('test');
    expect(trace.trigger.ref).toBe('v1.0.0');
    expect(Array.isArray(trace.narrative)).toBe(true);
    expect(trace.narrative.join('\n')).toMatch(/Init/);
    expect(trace.snapshot.sharedState.status).toBe('ok-finalized');
  });

  it('uploads trace as artifact + commits back when configured', async () => {
    const adapter = new MockAdapter({
      trigger: { event: 'release.published', ref: 'v2.0.0' },
    });
    const p = pipeline({
      name: 'test',
      adapter,
      triggers: ['release.published'],
      flow: () => flowChart<State>('A', (s) => { s.status = 'x'; }, 'a').build(),
      persistence: {
        traces: {
          dir: traceDir,
          uploadAsArtifact: true,
          commitBack: true,
        },
      },
    });
    await runPipeline(p);
    expect(adapter.calls.uploadArtifact).toHaveLength(1);
    expect(adapter.calls.uploadArtifact[0]!.name).toContain('v2.0.0');
    expect(adapter.calls.commitToRepo).toHaveLength(1);
  });

  it('invokes onFailure handler when a stage throws', async () => {
    const adapter = new MockAdapter({
      trigger: { event: 'release.published' },
    });
    let captured: Error | null = null;
    const p = pipeline({
      name: 'test',
      adapter,
      triggers: ['release.published'],
      flow: () =>
        flowChart<State>('Boom', () => {
          throw new Error('fail');
        }, 'boom').build(),
      persistence: { traces: { dir: traceDir } },
      onFailure: onFailure(async ({ error }) => {
        captured = error;
      }),
    });
    const r = await runPipeline(p);
    expect(r.status).toBe('failure');
    expect(captured).toBeInstanceOf(Error);
    expect((captured as unknown as Error).message).toContain('fail');
    expect(adapter.calls.finalized).toEqual(['failure']);
  });

  it('applies redaction policy via FootPrint', async () => {
    const adapter = new MockAdapter({
      trigger: { event: 'release.published', ref: 'v1.0.0' },
    });
    const p = pipeline({
      name: 'redact',
      adapter,
      triggers: ['release.published'],
      flow: () =>
        flowChart<{ token: string }>('Write', (scope) => {
          scope.token = 'super-secret-value';
        }, 'write').build(),
      persistence: { traces: { dir: traceDir } },
      redaction: { keys: ['token'] },
    });
    const r = await runPipeline(p);
    expect(r.status).toBe('success');
    const serialized = readFileSync(r.tracePath!, 'utf8');
    expect(serialized).not.toContain('super-secret-value');
  });
});
