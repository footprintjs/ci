import { describe, expect, it } from 'vitest';
import { flowChart } from 'footprintjs';
import { pipeline } from '../src/pipeline';
import { module } from '../src/module';
import { MockAdapter } from '../src/adapters/mock';

interface State {
  hello: string;
}

describe('pipeline() factory', () => {
  it('stores config fields and can build its flow', () => {
    const adapter = new MockAdapter();
    const p = pipeline({
      name: 'test',
      adapter,
      triggers: ['release.published'],
      flow: () =>
        flowChart<State>('Hello', (scope) => {
          scope.hello = 'world';
        }, 'hello').build(),
    });

    expect(p.name).toBe('test');
    expect(p.triggers).toEqual(['release.published']);
    const chart = p.flow();
    expect(chart.stageMap.size).toBeGreaterThan(0);
  });

  it('module() wraps a flow-chart factory', () => {
    const announce = module('announce', () =>
      flowChart<State>('A', (s) => { s.hello = 'a'; }, 'a').build()
    );
    const p = pipeline({
      name: 'mod-test',
      adapter: new MockAdapter(),
      triggers: ['release.published'],
      flow: () => announce.build(),
    });
    expect(announce.name).toBe('announce');
    expect(p.flow().stageMap.size).toBeGreaterThan(0);
  });
});
