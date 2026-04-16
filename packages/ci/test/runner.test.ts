import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from '../src/pipeline';
import { runPipeline } from '../src/runner';
import { MockAdapter } from '../src/adapters/mock';
import { onFailure } from '../src/failure-handler';

describe('runPipeline', () => {
  let traceDir: string;

  beforeEach(() => {
    traceDir = mkdtempSync(join(tmpdir(), 'fpci-'));
  });
  afterEach(() => {
    rmSync(traceDir, { recursive: true, force: true });
  });

  it('skips when trigger.event not in triggers[]', async () => {
    const adapter = new MockAdapter({ trigger: { event: 'push' } });
    const p = pipeline({
      name: 'test',
      adapter,
      triggers: ['release.published'],
      flow: (fp) => fp.stage('x', () => 'never'),
      persistence: { traces: { dir: traceDir } },
    });
    const r = await runPipeline(p);
    expect(r.status).toBe('skipped');
    expect(r.reason).toBe('trigger-mismatch');
    expect(adapter.calls.finalized).toEqual(['success']);
  });

  it('runs end-to-end and writes a trace', async () => {
    const adapter = new MockAdapter({
      trigger: { event: 'release.published', ref: 'v1.0.0' },
    });
    const p = pipeline({
      name: 'test',
      adapter,
      triggers: ['release.published'],
      flow: (fp) => fp.stage('x', () => ({ done: true })),
      persistence: { traces: { dir: traceDir } },
    });
    const r = await runPipeline(p);
    expect(r.status).toBe('success');
    expect(r.tracePath).toBeDefined();
    const trace = JSON.parse(readFileSync(r.tracePath!, 'utf8'));
    expect(trace.pipeline.name).toBe('test');
    expect(trace.stages).toHaveLength(1);
    expect(trace.stages[0].name).toBe('x');
    expect(trace.trigger.ref).toBe('v1.0.0');
  });

  it('uploads trace as artifact when configured', async () => {
    const adapter = new MockAdapter({
      trigger: { event: 'release.published', ref: 'v2.0.0' },
    });
    const p = pipeline({
      name: 'test',
      adapter,
      triggers: ['release.published'],
      flow: (fp) => fp.stage('x', () => 1),
      persistence: { traces: { dir: traceDir, uploadAsArtifact: true, commitBack: true } },
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
      flow: (fp) =>
        fp.stage('boom', () => {
          throw new Error('fail');
        }),
      persistence: { traces: { dir: traceDir } },
      onFailure: onFailure(async ({ error }) => {
        captured = error;
      }),
    });
    const r = await runPipeline(p);
    expect(r.status).toBe('failure');
    expect(captured).toBeInstanceOf(Error);
    expect((captured as unknown as Error).message).toBe('fail');
    expect(adapter.calls.finalized).toEqual(['failure']);
    const trace = JSON.parse(readFileSync(r.tracePath!, 'utf8'));
    expect(trace.error.message).toBe('fail');
  });

  it('writes a failure trace even when handler is absent', async () => {
    const adapter = new MockAdapter({ trigger: { event: 'release.published' } });
    const p = pipeline({
      name: 'test',
      adapter,
      triggers: ['release.published'],
      flow: (fp) => fp.stage('boom', () => { throw new Error('x'); }),
      persistence: { traces: { dir: traceDir } },
    });
    const r = await runPipeline(p);
    expect(r.status).toBe('failure');
    expect(r.tracePath).toBeDefined();
  });

  it('passes adapter context to onFailure handler', async () => {
    const adapter = new MockAdapter({ trigger: { event: 'release.published' } });
    const p = pipeline({
      name: 'test',
      adapter,
      triggers: ['release.published'],
      flow: (fp) => fp.stage('boom', () => { throw new Error('e'); }),
      persistence: { traces: { dir: traceDir } },
      onFailure: onFailure(({ adapter }) => {
        adapter.log('error', 'handler-saw-error');
      }),
    });
    await runPipeline(p);
    expect(adapter.calls.logs.some((l) => l.msg === 'handler-saw-error')).toBe(true);
  });
});
