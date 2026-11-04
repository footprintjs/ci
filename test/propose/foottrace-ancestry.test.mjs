import test from 'node:test';
import assert from 'node:assert/strict';
import { createFoottraceAncestryReader } from '../../src/propose/foottrace-ancestry.mjs';
import { createRefreshInputReader } from '../../src/propose/refresh-inputs.mjs';
import { createFoottracePreparationProfile } from '../../src/propose/foottrace-profile.mjs';
import { preparationWitnessFixture } from './preparation-witness-fixture.mjs';
import { sourceFixture } from './prepared-fixtures.mjs';
function fixture(change = () => {}) {
  const witness = preparationWitnessFixture(), currentSource = sourceFixture(); currentSource.commit.sha = 'e'.repeat(40);
  const prepared = createRefreshInputReader(createFoottracePreparationProfile())({
    pending: { witnesses: [witness], predecessor: witness.predecessor }, currentSource, currentPreparationDate: null });
  assert.equal(prepared.valid, true);
  const context = { repository: { id: 123, full_name: 'footprintjs/foottrace' }, sha: currentSource.commit.sha }, calls = [];
  let mainReads = 0;
  const api = async (method, route, body) => {
    calls.push({ method, route, body });
    let data;
    if (route.endsWith('/git/ref/heads/main')) { mainReads++; data = { object: { sha: context.sha } }; }
    else {
      const [from, to] = route.split('/compare/')[1].split('?')[0].split('...');
      data = { status: from === to ? 'identical' : 'ahead', ahead_by: from === to ? 0 : 1,
        behind_by: 0, total_commits: from === to ? 0 : 1, base_commit: { sha: from }, merge_base_commit: { sha: from },
        commits: from === to ? [] : [{ sha: to }], privateBody: 'PRIVATE-UNRECORDED-PROVIDER-BODY' };
    }
    change(data, route, mainReads); return { data };
  };
  return { prepared, context, calls, api };
}
test('reuses native complete ancestry admission and records compact GET boundaries only', async () => {
  const f = fixture(), result = await createFoottraceAncestryReader(f)(f.prepared);
  assert.equal(result.valid, true); assert.equal(result.scope, 'source-ancestry-only');
  assert.equal(result.publishedLineageAdmitted, false); assert.equal(result.authorized, false);
  assert.equal(result.edges.length, 2); assert.equal(result.observations.length, 4);
  assert.ok(f.calls.every(c => c.method === 'GET' && c.body === undefined));
  assert.equal(JSON.stringify(result).includes('PRIVATE-UNRECORDED'), false);
});
test('a divergent source cannot be refreshed even if preparation and queue match', async () => {
  const f = fixture((data, route) => { if (route.includes('/compare/')) data.status = 'diverged'; });
  assert.equal((await createFoottraceAncestryReader(f)(f.prepared)).valid, false);
});
test('moved main after comparison holds and retains the attempted read boundary', async () => {
  const f = fixture((data, route, count) => { if (route.endsWith('/git/ref/heads/main') && count > 1) data.object.sha = 'f'.repeat(40); });
  const result = await createFoottraceAncestryReader(f)(f.prepared);
  assert.equal(result.valid, false); assert.equal(result.observations.length, 4);
});
test('malformed compare counts hold rather than becoming an ancestry pass', async () => {
  const f = fixture((data, route) => { if (route.includes('/compare/')) data.total_commits = 1001; });
  assert.equal((await createFoottraceAncestryReader(f)(f.prepared)).valid, false);
});
test('repo mismatch refuses before calling the backend', async () => {
  const f = fixture(); f.context.repository.id++;
  assert.equal((await createFoottraceAncestryReader(f)(f.prepared)).valid, false); assert.equal(f.calls.length, 0);
});
test('private transport errors produce a fixed refusal and a failed boundary', async () => {
  const f = fixture(); f.api = async () => { throw new Error('PRIVATE-TRANSPORT-ERROR'); };
  const result = await createFoottraceAncestryReader(f)(f.prepared);
  assert.equal(result.valid, false); assert.equal(result.observations.length, 1);
  assert.equal(JSON.stringify(result).includes('PRIVATE-TRANSPORT'), false);
});
function multiPage(f, missingLast = false) {
  const original = f.api;
  f.api = async (method, route, body) => {
    const response = await original(method, route, body);
    if (route.includes('/compare/')) {
      const to = route.split('...')[1].split('?')[0];
      response.data.ahead_by = response.data.total_commits = 101;
      response.data.commits = route.endsWith('page=1') ? Array.from({ length: 100 }, (_, i) =>
        ({ sha: (i + 1).toString(16).padStart(40, '0') })) : missingLast ? [] : [{ sha: to }];
    }
    return response;
  };
}
test('complete multi-page comparisons retain fixed counts and exact terminal source', async () => {
  const f = fixture(); multiPage(f);
  const result = await createFoottraceAncestryReader(f)(f.prepared);
  assert.equal(result.valid, true); assert.equal(result.observations.length, 6);
});
test('an incomplete compare page holds rather than accepting a partial path', async () => {
  const f = fixture(); multiPage(f, true);
  const result = await createFoottraceAncestryReader(f)(f.prepared);
  assert.equal(result.valid, false); assert.equal(result.nativeReason, 'recovery-ancestry');
});
