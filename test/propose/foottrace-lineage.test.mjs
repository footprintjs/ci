import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createFoottraceLineageReader } from '../../src/propose/foottrace-lineage.mjs';
import { managedReleaseFixture } from '../upstream/test/release/helpers.mjs';
const require = createRequire(import.meta.url), native = require('../../src/guards/release-github.cjs');
async function fixture() {
  const f = managedReleaseFixture({ published: true });
  const context = { repository: f.repository, sha: f.context.sha };
  const input = await native.sourceInput(f.api, context);
  const expected = { sourceSha: context.sha, sourceTree: input.commit.tree.sha, fromVersion: input.pkg.version,
    predecessor: { pr: f.originalPR.number, head: f.originalHead,
      tree: f.commits.get(f.originalHead).tree.sha, merge: f.originalMerge } };
  const transport = { api: f.api, registry: () => f.fetcher };
  return { f, context, expected, transport, settings: f.options.settings };
}
test('joins real native publication admission to the exact claimed predecessor, without granting new release authority', async () => {
  const f = await fixture(), result = await createFoottraceLineageReader(f)(f.expected);
  assert.equal(result.valid, true); assert.equal(result.scope, 'published-lineage-only');
  assert.deepEqual(JSON.parse(JSON.stringify(result.predecessor)), f.expected.predecessor);
  assert.equal(result.authorized, false); assert.equal(result.privateAppIdentityAdmitted, false);
  assert.equal(result.provenanceCryptographicallyVerified, false);
  assert.ok(result.observations.length > 0);
  assert.ok(f.f.calls.every(call => call.method === 'GET'));
});
test('a substituted predecessor head is refused even when the published merge/archive is genuine', async () => {
  const f = await fixture(); f.expected.predecessor.head = 'f'.repeat(40);
  assert.equal((await createFoottraceLineageReader(f)(f.expected)).valid, false);
});
test('registry and journal disagreement cannot be promoted to published lineage', async () => {
  const f = await fixture(); f.f.registry.get('1.10.0').metadata.dist.integrity = 'sha512-Zm9v';
  assert.equal((await createFoottraceLineageReader(f)(f.expected)).valid, false);
});
test('an incomplete registry publication stays unavailable', async () => {
  const f = await fixture(); f.f.registry.clear();
  assert.equal((await createFoottraceLineageReader(f)(f.expected)).valid, false);
});
test('a failed external read retains a boundary without private exception text', async () => {
  const f = await fixture(); f.transport.api = async () => { throw new Error('PRIVATE-LINEAGE-ERROR'); };
  const result = await createFoottraceLineageReader(f)(f.expected);
  assert.equal(result.valid, false); assert.equal(result.observations.length, 1);
  assert.equal(JSON.stringify(result).includes('PRIVATE-LINEAGE'), false);
});
test('current source/tree substitutions are refused before published lineage can pass', async () => {
  const f = await fixture(); f.expected.sourceTree = 'f'.repeat(40);
  assert.equal((await createFoottraceLineageReader(f)(f.expected)).valid, false);
});
test('an ambiguous linked PR set after publication admission holds', async () => {
  const f = await fixture(), original = f.transport.api; let linkedReads = 0;
  f.transport.api = async (method, route, body) => {
    const reply = await original(method, route, body);
    if (route.includes(`/commits/${f.expected.predecessor.merge}/pulls`)) {
      linkedReads++;
      if (linkedReads > 1) return { data: [...reply.data, { ...reply.data[0], number: 999 }] };
    }
    return reply;
  };
  assert.equal((await createFoottraceLineageReader(f)(f.expected)).valid, false);
  assert.equal(linkedReads, 2);
});
test('moved main after read-only publication verification is unavailable', async () => {
  const f = await fixture(), original = f.transport.api; let reads = 0;
  f.transport.api = async (method, route, body) => {
    if (route.endsWith('/git/ref/heads/main') && ++reads > 1)
      return { data: { object: { sha: 'f'.repeat(40) } } };
    return original(method, route, body);
  };
  assert.equal((await createFoottraceLineageReader(f)(f.expected)).valid, false);
});
