import { createHash } from 'node:crypto';
import native from '../guards/release-github.cjs';
import control from '../guards/release-control.cjs';
import { fields, jsonData } from '../eco/json-data.mjs';
import { own } from './source-inventory.mjs';

function compareProjection(data) {
  const rows = own(data, 'commits'), length = own(rows, 'length');
  if (!Array.isArray(rows) || !Number.isSafeInteger(length) || length < 0 || length > 100)
    throw new Error('compare-projection');
  const commits = [];
  for (let i = 0; i < length; i++) commits.push({ sha: own(own(rows, String(i)), 'sha') });
  return jsonData({ status: own(data, 'status'), ahead_by: own(data, 'ahead_by'),
    behind_by: own(data, 'behind_by'), total_commits: own(data, 'total_commits'),
    base_commit: { sha: own(own(data, 'base_commit'), 'sha') },
    merge_base_commit: { sha: own(own(data, 'merge_base_commit'), 'sha') }, commits });
}

/** Foottrace native adapter, reusing its exact pinned ancestor/current-main guards.
 * The host supplies a reviewed bounded GET transport and native context. This
 * proves source relationships only: published L, repository/producer authority,
 * native eligibility and effect permission MUST still be admitted separately.
 */
export function createFoottraceAncestryReader({ api, context }) {
  const pinned = fields(jsonData(context), ['repository', 'sha']);
  fields(pinned.repository, ['id', 'full_name']);
  if (typeof api !== 'function' || pinned.repository.full_name !== 'footprintjs/foottrace' ||
      !Number.isSafeInteger(pinned.repository.id) || pinned.repository.id <= 0 || !control.validSha(pinned.sha))
    throw new TypeError('foottrace-ancestry-profile');
  return async prepared => {
    const observations = [], edges = [];
    try {
      if (own(prepared, 'valid') !== true) throw new Error('prepared-inputs');
      const input = jsonData({ sourceSha: own(prepared, 'sourceSha'), predecessor: own(prepared, 'predecessor'),
        refs: own(prepared, 'preparationRefs') });
      if (input.sourceSha !== pinned.sha || !Array.isArray(input.refs) || input.refs.length < 1 ||
          input.refs.length > 8 || !control.validSha(input.predecessor?.merge) || input.refs.some(ref =>
            ref.profileId !== 'foottrace-next-v1' || !control.validSha(ref.sourceSha) ||
            ref.producer?.repositoryId !== pinned.repository.id)) throw new Error('prepared-bindings');
      let from = input.predecessor.merge;
      for (const ref of input.refs) { edges.push(Object.freeze({ from, to: ref.sourceSha })); from = ref.sourceSha; }
      edges.push(Object.freeze({ from, to: pinned.sha }));
      const prefix = '/repos/footprintjs/foottrace', main = prefix + '/git/ref/heads/main';
      const allowed = new Set([main]);
      for (const edge of edges) for (let page = 1; page <= 10; page++)
        allowed.add(`${prefix}/compare/${edge.from}...${edge.to}?per_page=100&page=${page}`);
      const read = async (method, route, body) => {
        if (method !== 'GET' || body !== undefined || !allowed.has(route) || observations.length >= 92)
          throw new Error('native-read-boundary');
        const boundary = { method: 'GET', route, status: 'unavailable' };
        observations.push(boundary); // Retain the attempted boundary even if the port fails.
        const raw = own(await api(method, route), 'data');
        const data = route === main ? jsonData({ object: { sha: own(own(raw, 'object'), 'sha') } }) : compareProjection(raw);
        const bytes = Buffer.from(JSON.stringify(data));
        boundary.status = 'projected'; boundary.projectionBytes = bytes.length;
        boundary.projectionDigest = createHash('sha256').update(bytes).digest('hex');
        return { data };
      };
      await native.assertCurrentMain(read, pinned);
      for (const edge of edges) await native.requireAncestor(read, pinned, edge.from, edge.to);
      await native.assertCurrentMain(read, pinned);
      return Object.freeze({ valid: true, scope: 'source-ancestry-only', sourceSha: pinned.sha,
        publishedLineageAdmitted: false, repositoryIdentityAdmitted: false, authorized: false,
        edges: Object.freeze(edges), observations: Object.freeze(observations.map(Object.freeze)) });
    } catch (error) {
      return Object.freeze({ valid: false, reason: 'source-ancestry-unavailable',
        nativeReason: native.refusalCode(error), authorized: false,
        observations: Object.freeze(observations.map(Object.freeze)) });
    }
  };
}
