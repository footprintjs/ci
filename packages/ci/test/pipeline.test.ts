import { describe, expect, it } from 'vitest';
import { pipeline } from '../src/pipeline';
import { module } from '../src/module';
import { MockAdapter } from '../src/adapters/mock';

describe('pipeline() factory', () => {
  it('stores config fields and builds a flow', () => {
    const adapter = new MockAdapter();
    const p = pipeline({
      name: 'test',
      adapter,
      triggers: ['release.published'],
      flow: (fp) => fp.stage('s1', async () => ({ ok: true })),
    });

    expect(p.name).toBe('test');
    expect(p.triggers).toEqual(['release.published']);
    const def = p.buildFlow();
    expect(def.nodes).toHaveLength(1);
    expect(def.nodes[0]!.kind).toBe('stage');
  });

  it('supports modules via module() helper', () => {
    const announce = module('announce', (fp) =>
      fp.stage('s1', async () => 1).stage('s2', async () => 2)
    );
    const p = pipeline({
      name: 'mod-test',
      adapter: new MockAdapter(),
      triggers: ['release.published'],
      flow: (fp) => announce.apply(fp),
    });
    const def = p.buildFlow();
    expect(def.nodes).toHaveLength(2);
    expect(def.nodes.map((n) => n.name)).toEqual(['s1', 's2']);
  });
});
