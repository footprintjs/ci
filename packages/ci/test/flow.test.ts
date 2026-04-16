import { describe, expect, it } from 'vitest';
import { createBuilder, FlowRecorder, runFlow } from '../src/internal/flow';
import { MockAdapter } from '../src/adapters/mock';

describe('internal flow engine', () => {
  const ctx = async () => ({
    trigger: await new MockAdapter().readTrigger(),
    adapter: new MockAdapter(),
    env: {},
  });

  it('runs stages sequentially threading output to input', async () => {
    const def = createBuilder()
      .stage('a', () => 1)
      .stage('b', (x: any) => (x as number) + 2)
      .stage('c', (x: any) => (x as number) * 10)
      .build();
    const { output } = await runFlow(def, null, await ctx());
    expect(output).toBe(30);
  });

  it('decider routes to matching branch', async () => {
    const def = createBuilder()
      .decider('pick', () => 'b')
      .branch('a', () => 'A')
      .branch('b', () => 'B')
      .build();
    const { output } = await runFlow(def, null, await ctx());
    expect(output).toBe('B');
  });

  it('throws on decider branch that does not exist', async () => {
    const def = createBuilder()
      .decider('pick', () => 'nope')
      .branch('a', () => 'A')
      .build();
    await expect(runFlow(def, null, await ctx())).rejects.toThrow(/pick/);
  });

  it('fork runs branches in parallel and joins results', async () => {
    const def = createBuilder()
      .fork([
        { name: 'x', stage: async () => 'X' },
        { name: 'y', stage: async () => 'Y' },
      ])
      .join('collect', (input: any) => input)
      .build();
    const { output } = await runFlow(def, null, await ctx());
    expect(output).toEqual({ x: 'X', y: 'Y' });
  });

  it('retries failing stage up to maxAttempts', async () => {
    let attempts = 0;
    const def = createBuilder()
      .stage(
        'flaky',
        () => {
          attempts++;
          if (attempts < 3) throw new Error('nope');
          return 'ok';
        },
        { maxAttempts: 3, initialDelayMs: 1 }
      )
      .build();
    const recorder = new FlowRecorder();
    const { output } = await runFlow(def, null, await ctx(), { recorder });
    expect(output).toBe('ok');
    const trace = recorder.export();
    expect(trace.stages[0]!.retries).toBe(2);
  });

  it('records traces via FlowRecorder', async () => {
    const recorder = new FlowRecorder();
    const def = createBuilder()
      .stage('a', () => 1)
      .stage('b', () => 2)
      .build();
    await runFlow(def, null, await ctx(), { recorder });
    const trace = recorder.export();
    expect(trace.stages.map((s) => s.name)).toEqual(['a', 'b']);
    expect(trace.stages.every((s) => s.status === 'success')).toBe(true);
  });

  it('records failure status on unrecoverable error', async () => {
    const recorder = new FlowRecorder();
    const def = createBuilder()
      .stage('boom', () => {
        throw new Error('explode');
      })
      .build();
    await expect(runFlow(def, null, await ctx(), { recorder })).rejects.toThrow('explode');
    const trace = recorder.export();
    expect(trace.stages[0]!.status).toBe('failure');
    expect(trace.stages[0]!.error?.message).toBe('explode');
  });
});
