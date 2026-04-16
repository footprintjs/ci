import { describe, expect, it, beforeEach } from 'vitest';
import { GitHubActionsAdapter } from '../src/adapters/github-actions/adapter';

function makeDeps() {
  const infoCalls: string[] = [];
  const warnCalls: string[] = [];
  const errorCalls: string[] = [];
  const outputs: Array<[string, string]> = [];
  const artifactUploads: Array<{ name: string; files: string[] }> = [];

  const core = {
    info: (m: string) => infoCalls.push(m),
    warning: (m: string) => warnCalls.push(m),
    error: (m: string) => errorCalls.push(m),
    setOutput: (k: string, v: string) => outputs.push([k, v]),
  } as unknown as typeof import('@actions/core');

  const artifact = {
    DefaultArtifactClient: class {
      async uploadArtifact(name: string, files: string[]) {
        artifactUploads.push({ name, files });
        return {} as any;
      }
    },
  } as unknown as typeof import('@actions/artifact');

  // simpleGit is never actually invoked in unit tests — pass a stub.
  const simpleGit = {
    simpleGit: () => {
      throw new Error('simple-git not stubbed for this test');
    },
  } as unknown as typeof import('simple-git');

  return { core, artifact, simpleGit, infoCalls, warnCalls, errorCalls, outputs, artifactUploads };
}

describe('GitHubActionsAdapter', () => {
  beforeEach(() => {
    delete process.env.GITHUB_EVENT_NAME;
    delete process.env.GITHUB_EVENT_PATH;
    delete process.env.GITHUB_REF;
    delete process.env.GITHUB_SHA;
    delete process.env.GITHUB_ACTOR;
  });

  it('reads trigger from GITHUB_* env vars', async () => {
    process.env.GITHUB_EVENT_NAME = 'workflow_dispatch';
    process.env.GITHUB_REF = 'refs/heads/main';
    process.env.GITHUB_SHA = 'deadbeef';
    process.env.GITHUB_ACTOR = 'test-user';
    const d = makeDeps();
    const a = new GitHubActionsAdapter(d);
    const t = await a.readTrigger();
    expect(t.event).toBe('manual');
    expect(t.ref).toBe('main');
    expect(t.sha).toBe('deadbeef');
    expect(t.actor).toBe('test-user');
  });

  it('reads secrets from process.env, undefined for missing', () => {
    process.env['TEST_KEY_123'] = 'val';
    const d = makeDeps();
    const a = new GitHubActionsAdapter(d);
    const s = a.readSecrets(['TEST_KEY_123', '__missing__'] as const);
    expect(s['TEST_KEY_123']).toBe('val');
    expect(s['__missing__']).toBeUndefined();
    delete process.env['TEST_KEY_123'];
  });

  it('log() routes to core.info / warning / error', () => {
    const d = makeDeps();
    const a = new GitHubActionsAdapter(d);
    a.log('info', 'hi');
    a.log('warn', 'caution');
    a.log('error', 'bad', { code: 1 });
    expect(d.infoCalls).toEqual(['hi']);
    expect(d.warnCalls).toEqual(['caution']);
    expect(d.errorCalls[0]).toContain('bad');
    expect(d.errorCalls[0]).toContain('"code":1');
  });

  it('setOutput delegates to core.setOutput', async () => {
    const d = makeDeps();
    const a = new GitHubActionsAdapter(d);
    await a.setOutput('key', 'value');
    expect(d.outputs).toEqual([['key', 'value']]);
  });

  it('uploadArtifact delegates to artifact client', async () => {
    const d = makeDeps();
    const a = new GitHubActionsAdapter(d);
    await a.uploadArtifact({ path: '/tmp/x.json', name: 'trace' });
    expect(d.artifactUploads).toHaveLength(1);
    expect(d.artifactUploads[0]!.name).toBe('trace');
  });
});
