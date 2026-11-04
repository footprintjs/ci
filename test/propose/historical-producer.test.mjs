import test from 'node:test';
import assert from 'node:assert/strict';
import { admitHistoricalPreparationProducer } from '../../src/propose/historical-producer.mjs';

import { producerFixture } from './fixtures.mjs';

test('admits a completed historical prepare binding without current-run authority', () => {
  const f = producerFixture(), result = admitHistoricalPreparationProducer(f);
  assert.equal(result.valid, true);
  assert.deepEqual(result.binding, { repositoryId: 123, runId: 456, runAttempt: 1, jobId: 789,
    artifactId: 900, sourceSha: f.expected.sourceSha, tree: f.expected.tree, package: 'foottrace', version: '1.10.1' });
  assert.equal(Object.hasOwn(result, 'authorized'), false);
});

for (const [name, change] of [
  ['run still in progress', f => { f.run.status = 'in_progress'; f.run.conclusion = null; }],
  ['failed run', f => { f.run.conclusion = 'failure'; }],
  ['wrong source', f => { f.run.head_sha = 'c'.repeat(40); }],
  ['fork source', f => { f.run.head_repository = { id: 1, full_name: 'other/repository' }; }],
  ['wrong workflow', f => { f.run.path = '.github/workflows/other.yml'; }],
  ['wrong attempt', f => { f.run.run_attempt = 2; }],
  ['wrong job attempt', f => { f.job.run_attempt = 2; }],
  ['wrong job source', f => { f.job.head_sha = 'c'.repeat(40); }],
  ['expired artifact', f => { f.artifact.expired = true; }],
  ['wrong artifact run', f => { f.artifact.workflow_run.id = 457; }],
  ['fork artifact', f => { f.artifact.workflow_run.head_repository_id = 1; }],
  ['wrong manifest job', f => { f.manifest.jobId = 790; }],
  ['wrong manifest target', f => { f.manifest.version = '1.11.0'; }],
]) test(`refuses ${name}`, () => {
  const f = producerFixture(); change(f); assert.equal(admitHistoricalPreparationProducer(f).valid, false);
});

// This separate reader must not loosen the old live workflow authority predicate.
test('the current-run validator still refuses the same completed historical run', async () => {
  const { createRequire } = await import('node:module');
  const { producerIdentity } = createRequire(import.meta.url)('../../src/guards/release-github.cjs');
  const f = producerFixture(), calls = [];
  const api = async (method, route) => { calls.push({ method, route }); return { data: f.run }; };
  await assert.rejects(() => producerIdentity(api, { repository: f.expected.repository,
    runId: 456, runAttempt: 1, sha: f.expected.sourceSha, ref: 'refs/heads/main', eventName: 'push' }, 'prepare', true),
  { code: 'current-run-status' });
  assert.equal(calls.length, 1);
});
