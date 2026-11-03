import test from 'node:test';
import assert from 'node:assert/strict';
import { createFoottracePendingReader } from '../../src/propose/foottrace-pending.mjs';
import { pendingProviderFixture as fixture, PRIVATE } from './pending-provider-fixture.mjs';

test('binds one exact open pending PR/ref/tree/parents to current main without granting retained eligibility', async () => {
  const f = fixture(), result = await createFoottracePendingReader(f)(f.prepared);
  assert.equal(result.valid, true); assert.equal(result.scope, 'pending-reference-only'); assert.equal(result.reference.pr, 41);
  assert.equal(result.reference.head, f.prepared.pendingSha); assert.equal(result.reference.tree, f.prepared.pendingTree);
  assert.equal(result.authorized, false); assert.equal(result.retainedEligibilityAdmitted, false); assert.equal(result.privateAppIdentityAdmitted, false);
  assert.ok(f.calls.length > 0); assert.ok(f.calls.every(row => row.method === 'GET' && row.body === undefined));
  assert.equal(JSON.stringify(result).includes(PRIVATE), false);
});
test('moved PR head after initial binding holds', async () => {
  const f = fixture((data, route, count) => { if (route.endsWith('/pulls/41') && count.detailReads > 1) data.head.sha = 'f'.repeat(40); });
  assert.equal((await createFoottracePendingReader(f)(f.prepared)).valid, false);
});
test('a second visibly open pending PR holds', async () => {
  const f = fixture((data, route) => { if (route.includes('/pulls?')) data.push({ ...structuredClone(data[0]), id: 42, number: 42 }); });
  assert.equal((await createFoottracePendingReader(f)(f.prepared)).valid, false);
});
test('DETAIL missing merged flag is unavailable, never invented false from LIST', async () => {
  const f = fixture((data, route) => { if (route.endsWith('/pulls/41')) delete data.merged; });
  assert.equal((await createFoottracePendingReader(f)(f.prepared)).valid, false);
});
test('pending commit parent substitution holds', async () => {
  const f = fixture((data, route) => { if (route.includes('/git/commits/')) data.parents[0].sha = 'f'.repeat(40); });
  assert.equal((await createFoottracePendingReader(f)(f.prepared)).valid, false);
});
test('malformed PR scalar containers refuse without retaining nested provider content', async () => {
  const f = fixture((data, route) => { if (route.endsWith('/pulls/41')) data.state = { private: PRIVATE }; });
  const result = await createFoottracePendingReader(f)(f.prepared); assert.equal(result.valid, false);
  assert.equal(JSON.stringify(result).includes(PRIVATE), false);
});
test('private transport error retains only the attempted boundary and finite refusal', async () => {
  const f = fixture(); f.api = async () => { throw new Error(PRIVATE); };
  const result = await createFoottracePendingReader(f)(f.prepared);
  assert.equal(result.valid, false); assert.equal(result.observations.length, 1); assert.equal(JSON.stringify(result).includes(PRIVATE), false);
});
test('moved main at the last read holds', async () => {
  const f = fixture((data, route, count) => { if (route.endsWith('/git/ref/heads/main') && count.mainReads > 1) data.object.sha = 'f'.repeat(40); });
  assert.equal((await createFoottracePendingReader(f)(f.prepared)).valid, false);
});
test('PR and LIST agreeing on a substituted head still conflict with the bound ref', async () => {
  const f = fixture((data, route) => {
    if (route.includes('/pulls?')) for (const row of data) row.head.sha = 'f'.repeat(40);
    if (route.endsWith('/pulls/41')) data.head.sha = 'f'.repeat(40);
  });
  assert.equal((await createFoottracePendingReader(f)(f.prepared)).valid, false);
});
test('auto-merge presence blocks the current pending state without retaining its body', async () => {
  const f = fixture((data, route) => {
    if (route.includes('/pulls?')) for (const row of data) row.auto_merge = { private: PRIVATE };
    if (route.endsWith('/pulls/41')) data.auto_merge = { private: PRIVATE };
  });
  const result = await createFoottracePendingReader(f)(f.prepared);
  assert.equal(result.valid, false); assert.equal(JSON.stringify(result).includes(PRIVATE), false);
});
test('closed historical rows are current-reference metadata only and do not imply retained release eligibility', async () => {
  const f = fixture((data, route) => {
    if (route.includes('/pulls?')) data.push({ ...structuredClone(data[0]), id: 40, number: 40, state: 'closed',
      merged_at: '2026-11-01T01:00:00Z', merge_commit_sha: '3'.repeat(40), head: { ...data[0].head, sha: '1'.repeat(40) } });
  });
  const result = await createFoottracePendingReader(f)(f.prepared);
  assert.equal(result.valid, true); assert.equal(result.associatedRows, 2); assert.equal(result.retainedEligibilityAdmitted, false);
  assert.equal(f.calls.filter(row => row.route.includes('/git/commits/')).length, 1);
});
test('duplicate associated IDs refuse through the unchanged native complete-page guard', async () => {
  const f = fixture((data, route) => { if (route.includes('/pulls?')) data.push(structuredClone(data[0])); });
  const result = await createFoottracePendingReader(f)(f.prepared);
  assert.equal(result.valid, false); assert.equal(result.nativeReason, 'incomplete-pages');
});
test('an unterminated eight-page listing holds, with no ninth provider acquisition', async () => {
  const f = fixture((data, route) => {
    if (route.includes('/pulls?')) {
      const page = Number(new URL('https://fixture.invalid' + route).searchParams.get('page')), row = data[0];
      data.splice(0, data.length, ...Array.from({ length: 100 }, (_, i) => ({ ...structuredClone(row), id: page * 100 + i, number: page * 100 + i })));
    }
  });
  const result = await createFoottracePendingReader(f)(f.prepared);
  assert.equal(result.valid, false); assert.equal(f.calls.filter(row => row.route.includes('/pulls?')).length, 8);
});

test('observed PR base can remain the original preparation source while main has advanced', async () => {
  const f = fixture((data, route) => {
    const rows = route.includes('/pulls?') ? data : route.endsWith('/pulls/41') ? [data] : [];
    for (const row of rows) row.base.sha = 'a'.repeat(40);
  });
  assert.notEqual(f.context.sha, 'a'.repeat(40));
  const result = await createFoottracePendingReader(f)(f.prepared);
  assert.equal(result.valid, true);
  assert.equal(result.reference.source, f.context.sha);
  assert.equal(result.reference.observedBase, 'a'.repeat(40));
  assert.equal(result.retainedEligibilityAdmitted, false); assert.equal(result.authorized, false);
});
test('observed PR base is snapshot metadata, never substituted for a preparation witness or main', async () => {
  const f = fixture((data, route) => {
    const rows = route.includes('/pulls?') ? data : route.endsWith('/pulls/41') ? [data] : [];
    for (const row of rows) row.base.sha = 'c'.repeat(40);
  });
  const result = await createFoottracePendingReader(f)(f.prepared);
  assert.equal(result.valid, true);
  assert.equal(result.reference.observedBase, 'c'.repeat(40));
  assert.equal(result.reference.source, f.prepared.sourceSha);
  assert.deepEqual(result.reference.parents, [f.prepared.preparationRefs[0].sourceSha, f.prepared.predecessor.head]);
  assert.equal(result.authorized, false); assert.equal(result.retainedEligibilityAdmitted, false);
});
test('moving observed PR base during the adjacent snapshots still holds', async () => {
  const f = fixture((data, route, count) => {
    const rows = route.includes('/pulls?') ? data : route.endsWith('/pulls/41') ? [data] : [];
    for (const row of rows) row.base.sha = count.detailReads > 1 ? 'c'.repeat(40) : 'a'.repeat(40);
  });
  assert.equal((await createFoottracePendingReader(f)(f.prepared)).valid, false);
});
test('stale observed PR base never permits a different base repository', async () => {
  const f = fixture((data, route) => {
    const rows = route.includes('/pulls?') ? data : route.endsWith('/pulls/41') ? [data] : [];
    for (const row of rows) { row.base.sha = 'a'.repeat(40); row.base.repo = { id: 999, full_name: 'other/foottrace' }; }
  });
  assert.equal((await createFoottracePendingReader(f)(f.prepared)).valid, false);
});

test('the pending reference retains its actual App bot identity for fresh proposer joins',async()=>{
 const f=fixture(),r=await createFoottracePendingReader(f)(f.prepared);assert.equal(r.valid,true);assert.equal(r.reference.botId,500);
});
