import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTrace } from '../src/persistence/trace-writer';
import type { TraceEnvelope } from '../src/persistence/types';

function makeEnvelope(overrides: Partial<TraceEnvelope> = {}): TraceEnvelope {
  return {
    version: 'v1.0.0',
    timestamp: '2026-04-20T14:32:11.000Z',
    durationMs: 100,
    flowId: 'flow_test',
    footprintVersion: '0.0.0',
    ciVersion: '0.1.0',
    adapter: 'mock',
    trigger: { event: 'release.published', ref: 'v1.0.0' },
    pipeline: { name: 'p', triggers: ['release.published'] },
    stages: [],
    forks: [],
    ...overrides,
  };
}

describe('writeTrace', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'tw-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('writes a JSON file with sanitized ref in name', async () => {
    const env = makeEnvelope({ trigger: { event: 'release.published', ref: 'v1.2.3' } });
    const r = await writeTrace(env, { dir });
    expect(r.path).toContain('v1.2.3');
    const parsed = JSON.parse(readFileSync(r.path, 'utf8'));
    expect(parsed.pipeline.name).toBe('p');
  });

  it('writes atomically (no .tmp file left over)', async () => {
    await writeTrace(makeEnvelope(), { dir });
    const entries = readdirSync(dir);
    expect(entries.every((e) => !e.endsWith('.tmp'))).toBe(true);
  });

  it('truncates oversized traces and preserves note', async () => {
    const bigStages = Array.from({ length: 500 }, (_, i) => ({
      name: `s${i}`,
      big: 'x'.repeat(5000),
    }));
    const env = makeEnvelope({ stages: bigStages });
    const r = await writeTrace(env, { dir, maxSizeBytes: 50_000 });
    expect(r.truncated).toBe(true);
    const parsed = JSON.parse(readFileSync(r.path, 'utf8'));
    expect(parsed._truncation.originalStageCount).toBe(500);
    expect(parsed.stages.length).toBeLessThan(500);
  });
});
