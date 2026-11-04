import assert from 'node:assert/strict';
import { createFoottracePreparationProfile } from '../../src/propose/foottrace-profile.mjs';
import { createRefreshInputReader } from '../../src/propose/refresh-inputs.mjs';
import { preparationWitnessFixture } from './preparation-witness-fixture.mjs';
import { sourceFixture } from './prepared-fixtures.mjs';
export const PRIVATE = 'PRIVATE-PENDING-PROVIDER-BODY';
export function pendingProviderFixture(change = () => {}) {
  const witness = preparationWitnessFixture(), currentSource = sourceFixture(); currentSource.commit.sha = 'e'.repeat(40);
  const prepared = createRefreshInputReader(createFoottracePreparationProfile())({ pending: { witnesses: [witness], predecessor: witness.predecessor }, currentSource, currentPreparationDate: null });
  assert.equal(prepared.valid, true);
  const repository = { id: 123, full_name: 'footprintjs/foottrace' }, context = { repository, sha: currentSource.commit.sha }, settings = { slug: 'foottrace-release' };
  const candidate = { id: 41, number: 41, state: 'open', merged: false, merged_at: null, merge_commit_sha: null, auto_merge: null,
    updated_at: '2026-11-02T01:00:00Z', head: { sha: prepared.pendingSha, ref: 'release/next', repo: repository },
    base: { ref: 'main', sha: context.sha, repo: repository }, user: { id: 500, type: 'Bot' }, privateBody: PRIVATE };
  const calls = []; let detailReads = 0, mainReads = 0;
  const api = async (method, route, body) => {
    calls.push({ method, route, body }); let data;
    if (route === '/repos/footprintjs/foottrace') data = { ...repository, default_branch: 'main', archived: false, privateBody: PRIVATE };
    else if (route.startsWith('/users/')) data = { id: 500, type: 'Bot', login: 'foottrace-release[bot]', privateBody: PRIVATE };
    else if (route.endsWith('/git/ref/heads/main')) { mainReads++; data = { object: { type: 'commit', sha: context.sha }, privateBody: PRIVATE }; }
    else if (route.endsWith('/git/ref/heads/release/next')) data = { object: { type: 'commit', sha: prepared.pendingSha }, privateBody: PRIVATE };
    else if (route.includes('/pulls?')) { const row = structuredClone(candidate); delete row.merged; data = [row]; }
    else if (route.endsWith('/pulls/41')) { detailReads++; data = structuredClone(candidate); }
    else if (route.includes('/git/commits/')) data = { sha: prepared.pendingSha, tree: { sha: prepared.pendingTree },
      parents: [{ sha: witness.originalSource.commit.sha }, { sha: prepared.predecessor.head }], privateBody: PRIVATE };
    else throw new Error('fixture-route');
    change(data, route, { detailReads, mainReads }); return { data };
  };
  return { api, context, settings, prepared, calls };
}
