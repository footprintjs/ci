import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
    footprintVersion: '4.12.2',
    ciVersion: '0.1.0',
    adapter: 'mock',
    trigger: { event: 'release.published', ref: 'v1.0.0' },
    pipeline: { name: 'p', triggers: ['release.published'] },
    narrative: [],
    narrativeEntries: [],
    snapshot: null,
    ...overrides,
  };
}

describe('writeTrace', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'tw-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('writes a JSON file with sanitized ref in name', async () => {
    const env = makeEnvelope({
      trigger: { event: 'release.published', ref: 'v1.2.3' },
    });
    const r = await writeTrace(env, { dir });
    expect(r.path).toContain('v1.2.3');
    const parsed = JSON.parse(readFileSync(r.path, 'utf8'));
    expect(parsed.pipeline.name).toBe('p');
  });

  it('writes atomically — no .tmp left behind', async () => {
    await writeTrace(makeEnvelope(), { dir });
    const entries = readdirSync(dir);
    expect(entries.every((e) => !e.endsWith('.tmp'))).toBe(true);
  });

  it('handles circular refs in snapshot without throwing', async () => {
    const circular: Record<string, unknown> = { name: 'root' };
    circular['self'] = circular;
    const env = makeEnvelope({
      snapshot: { sharedState: circular, executionTree: null, commitLog: [] } as any,
    });
    const r = await writeTrace(env, { dir });
    const text = readFileSync(r.path, 'utf8');
    expect(text).toContain('[Circular]');
  });

  it('truncates oversized traces by dropping snapshot + trimming narrative', async () => {
    const bigNarrative = Array.from({ length: 1000 }, (_, i) => `step ${i} `.repeat(100));
    const env = makeEnvelope({ narrative: bigNarrative });
    const r = await writeTrace(env, { dir, maxSizeBytes: 20_000 });
    expect(r.truncated).toBe(true);
    const parsed = JSON.parse(readFileSync(r.path, 'utf8'));
    expect(parsed._truncation.originalNarrativeCount).toBe(1000);
    expect(parsed.narrative.length).toBeLessThan(1000);
    expect(parsed.snapshot).toBeNull();
  });
});
