import { describe, expect, it } from 'vitest';
import { MockAdapter } from '../src/adapters/mock';

describe('MockAdapter', () => {
  it('returns configured trigger', async () => {
    const a = new MockAdapter({ trigger: { ref: 'v2.3.4', event: 'release.published' } });
    const t = await a.readTrigger();
    expect(t.ref).toBe('v2.3.4');
    expect(t.event).toBe('release.published');
  });

  it('returns undefined for missing secrets, string for present ones', () => {
    const a = new MockAdapter({ secrets: { FOO: 'bar' } });
    const r = a.readSecrets(['FOO', 'MISSING'] as const);
    expect(r.FOO).toBe('bar');
    expect(r.MISSING).toBeUndefined();
  });

  it('records uploadArtifact, commitToRepo, outputs, and logs', async () => {
    const a = new MockAdapter();
    await a.uploadArtifact({ path: '/tmp/x', name: 'x' });
    await a.commitToRepo({ path: '/tmp/x', message: 'chore: x' });
    await a.setOutput('key', 'value');
    a.log('info', 'hi', { k: 1 });
    expect(a.calls.uploadArtifact).toHaveLength(1);
    expect(a.calls.commitToRepo).toHaveLength(1);
    expect(a.calls.outputs[0]).toEqual({ key: 'key', value: 'value' });
    expect(a.calls.logs[0]).toMatchObject({ level: 'info', msg: 'hi', meta: { k: 1 } });
  });

  it('tracks lifecycle (initialize / finalize)', async () => {
    const a = new MockAdapter();
    await a.initialize();
    await a.finalize('success');
    expect(a.calls.initialized).toBe(1);
    expect(a.calls.finalized).toEqual(['success']);
  });

  it('throws configured errors on operations', async () => {
    const a = new MockAdapter({
      uploadError: new Error('up-boom'),
      commitError: new Error('commit-boom'),
      triggerError: new Error('trigger-boom'),
    });
    await expect(a.readTrigger()).rejects.toThrow('trigger-boom');
    await expect(a.uploadArtifact({ path: 'x', name: 'x' })).rejects.toThrow('up-boom');
    await expect(a.commitToRepo({ path: 'x', message: 'x' })).rejects.toThrow('commit-boom');
  });
});
