import gitBlob from '../guards/git-blob.cjs';
import native from '../guards/release-github.cjs';
import { isDeepStrictEqual } from 'node:util';
import control from '../guards/release-control.cjs';
import preparation from '../guards/release-prepare.cjs';
import { fields, jsonData } from '../eco/json-data.mjs';
import { own } from './source-inventory.mjs';

/** Foottrace adapter over the exact pinned PUBLIC native publication/source guards.
 * The host must supply a reviewed bounded read-only transport. No historical
 * helper is loaded/executed from target Git data. Published data lineage is not
 * fresh current-run/App/User authority, global publisher authentication or a grant.
 */
export function createFoottraceLineageObservationReader({ transport, context, settings }) {
  const pinned = fields(jsonData(context), ['repository', 'sha']);
  fields(pinned.repository, ['id', 'full_name']);
  const app = fields(jsonData(settings), ['slug', 'clientId']);
  const apiPort = own(transport, 'api'), registryPort = own(transport, 'registry');
  if (pinned.repository.full_name !== 'footprintjs/foottrace' || !control.validSha(pinned.sha) ||
      !Number.isSafeInteger(pinned.repository.id) || pinned.repository.id <= 0 ||
      typeof app.slug !== 'string' || !/^[a-z0-9-]{1,100}$/.test(app.slug) ||
      typeof app.clientId !== 'string' || !/^[A-Za-z0-9_.-]{1,200}$/.test(app.clientId) ||
      typeof apiPort !== 'function' || typeof registryPort !== 'function') throw new TypeError('foottrace-lineage-profile');
  return async () => {
    const observations = [], admittedPulls = new Map(), admittedMarkers = new Map();
    try {
      let sourceVersion, fetchPort;
      const prefix = '/repos/footprintjs/foottrace';
      const begin = (kind, route) => {
        if (observations.length >= 4096) throw new Error('lineage-read-budget');
        const item = { kind, method: 'GET', route, status: 'unavailable' }; observations.push(item); return item;
      };
      const api = async (method, route, body) => {
        const asset = body === undefined || (Object.keys(body).length === 1 && own(body, 'accept') === 'application/octet-stream');
        const bot = `/users/${encodeURIComponent(app.slug + '[bot]')}`;
        if (method !== 'GET' || !asset || typeof route !== 'string' || route.length > 8192 ||
            !(route.startsWith(prefix + '/') || route === bot)) throw new Error('lineage-read-route');
        const item = begin('native-api', route), reply = await apiPort(method, route, body);
        const suffix = route.startsWith(prefix + '/pulls/') ? route.slice((prefix + '/pulls/').length) : '';
        if (/^[1-9]\d*$/.test(suffix)) {
          // Capture only the owned identity actually consumed by the unchanged
          // native publication guard. A later linked-list head is not its output.
          const raw = own(reply, 'data'), row = jsonData({ pr: own(raw, 'number'),
            head: own(own(raw, 'head'), 'sha'), merge: own(raw, 'merge_commit_sha') });
          if (row.pr !== Number(suffix) || !Number.isSafeInteger(row.pr) || row.pr <= 0 ||
              !control.validSha(row.head) || !control.validSha(row.merge) ||
              (admittedPulls.has(row.pr) && !isDeepStrictEqual(admittedPulls.get(row.pr), row))) throw new Error('lineage-detail');
          admittedPulls.set(row.pr, row);
        }
        if (/^\/repos\/footprintjs\/foottrace\/releases\/assets\/[1-9]\d*$/.test(route) &&
            body !== undefined && own(body,'accept') === 'application/octet-stream') {
          const bytes = Buffer.from(own(reply,'data'));
          if (!bytes.length || bytes.length > 4096) throw new Error('lineage-marker');
          const marker = fields(jsonData(JSON.parse(preparation.decodeRaw(bytes))),
            ['version','sha','integrity','runId','runAttempt']);
          if (admittedMarkers.has(route) && !isDeepStrictEqual(admittedMarkers.get(route),marker))
            throw new Error('lineage-marker-drift');
          admittedMarkers.set(route,marker);
        }
        item.status = 'returned'; return reply;
      };
      gitBlob.inheritGitBlobRead(api,apiPort);
      const fetcher = async (url, options = {}) => {
        const allowed = new Set([`https://registry.npmjs.org/foottrace/${sourceVersion}`,
          'https://registry.npmjs.org/foottrace/latest',
          `https://registry.npmjs.org/foottrace/-/foottrace-${sourceVersion}.tgz`]);
        if ((options.method ?? 'GET') !== 'GET' || options.body !== undefined || !allowed.has(url))
          throw new Error('lineage-registry-route');
        const item = begin('native-registry', url), response = await fetchPort(url, options);
        item.status = 'returned'; return response;
      };
      await native.assertCurrentMain(api, pinned);
      const source = await native.sourceInput(api, pinned);
      sourceVersion = source.pkg.version; preparation.parseVersion(sourceVersion);
      fetchPort = registryPort(sourceVersion); if (typeof fetchPort !== 'function') throw new Error('lineage-registry-port');
      const published = await native.publicationState(api, pinned, source, { fetcher, settings: app });
      if (published.state !== 'published' || published.version !== sourceVersion) throw new Error('lineage-publication');
      // Join the second complete linked list to the exact PR detail consumed
      // during successful native admission; equal trees do not bind PR heads.
      const linked = await native.pages(api, `${prefix}/commits/${published.sha}/pulls`);
      const matching = linked.filter(row => row.merge_commit_sha === published.sha && row.head?.ref === 'release/next');
      if (matching.length !== 1) throw new Error('lineage-join');
      const actual = admittedPulls.get(matching[0].number);
      if (!actual || matching[0].head?.sha !== actual.head || actual.merge !== published.sha ||
          (await source.view.commit(actual.head)).tree.sha !== published.tree) throw new Error('lineage-join');
      if (admittedMarkers.size !== 1) throw new Error('lineage-marker');
      const marker = [...admittedMarkers.values()][0];
      if (marker.version !== published.version || marker.sha !== published.sha || marker.integrity !== published.integrity ||
          !Number.isSafeInteger(marker.runId) || marker.runId < 1 || !Number.isSafeInteger(marker.runAttempt) ||
          marker.runAttempt < 1 || marker.runAttempt > 8) throw new Error('lineage-producer');
      const producer = jsonData({runId:marker.runId,runAttempt:marker.runAttempt});
      const predecessor = jsonData({ ...actual, tree: published.tree });
      await native.assertCurrentMain(api, pinned);
      return Object.freeze({ valid: true, scope: 'published-lineage-only', predecessor, producer,
        version: published.version, tree: published.tree, archiveDigest: published.sha256,
        sourceSha: source.commit.sha, sourceTree: source.commit.tree.sha,
        provenanceCryptographicallyVerified: false, privateAppIdentityAdmitted: false, authorized: false,
        observations: Object.freeze(observations.map(Object.freeze)) });
    } catch (error) {
      return Object.freeze({ valid: false, reason: 'published-lineage-unavailable',
        nativeReason: native.refusalCode(error), authorized: false,
        observations: Object.freeze(observations.map(Object.freeze)) });
    }
  };
}


/** Prepared-source/predecessor join over the SAME native publication observer.
 * Observation discovers L; source preparation must independently match its exact
 * immutable PR/head/tree/merge identity. Neither step admits current authority.
 */
export function createFoottraceLineageReader(options) {
  const observe = createFoottraceLineageObservationReader(options);
  return async input => {
    let expected;
    try {
      expected = fields(jsonData(input), ['sourceSha', 'sourceTree', 'fromVersion', 'predecessor']);
      const p = fields(expected.predecessor, ['pr', 'head', 'tree', 'merge']);
      preparation.parseVersion(expected.fromVersion);
      if (expected.sourceSha !== options.context.sha || !control.validSha(expected.sourceTree) ||
          !Number.isSafeInteger(p.pr) || p.pr <= 0 || ![p.head, p.tree, p.merge].every(control.validSha)) throw new Error();
    } catch { return Object.freeze({ valid: false, reason: 'published-lineage-unavailable', authorized: false, observations: [] }); }
    const observed = await observe();
    if (!observed.valid) return observed;
    if (observed.sourceSha !== expected.sourceSha || observed.sourceTree !== expected.sourceTree ||
        observed.version !== expected.fromVersion || !isDeepStrictEqual(observed.predecessor, expected.predecessor))
      return Object.freeze({ valid: false, reason: 'published-lineage-unavailable', authorized: false, observations: observed.observations });
    return observed;
  };
}
