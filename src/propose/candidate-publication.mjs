import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import native from '../guards/release-github.cjs';
import control from '../guards/release-control.cjs';
import preparation from '../guards/release-prepare.cjs';
import { jsonData, fields, id, text, array, unique } from '../eco/json-data.mjs';
import { own } from './source-inventory.mjs';
const fail = () => { throw new Error('candidate-publication-unavailable'); };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const choice = (value, choices) => { if (!choices.includes(value)) fail(); return value; };
const size = value => { if (!Number.isSafeInteger(value) || value < 0 || value > 64 * 1024 * 1024) fail(); return value; };
const boolean = value => { if (typeof value !== 'boolean') fail(); return value; };
function version(value) {
  text(value, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 100); preparation.parseVersion(value); return value;
}
export function candidateVersions(prepared, scope) {
  choice(scope, ['pending-chain', 'current-target']);
  if (own(prepared, 'valid') !== true) fail();
  const base = version(own(prepared, 'fromVersion')), target = version(own(prepared, 'version'));
  const refs = own(prepared, 'preparationRefs');
  if (scope === 'current-target') {
    const payload = own(prepared, 'prepared');
    if (own(prepared, 'scope') !== 'current-prepared-inputs-only' || own(prepared, 'authorized') !== false ||
        own(prepared, 'originalProducerAttributed') !== false || refs !== undefined ||
        !['sourceSha','sourceTree','targetTree'].every(key => control.validSha(own(prepared,key))) ||
        own(payload,'version') !== target || own(payload,'fromVersion') !== base ||
        own(payload,'package') !== own(prepared,'packageName')) fail();
    text(own(prepared,'packageName'), /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/, 214);
    if (preparation.versionOrder(target, base) <= 0) fail();
    return jsonData([target]);
  }
  array(refs, 8); if (!refs.length) fail();
  const versions = [target];
  for (let i = 0; i < refs.length; i++) versions.push(version(own(own(refs, String(i)), 'version')));
  for (const candidate of versions) if (preparation.versionOrder(candidate, base) <= 0) fail();
  return jsonData([...new Set(versions)].sort(preparation.versionOrder));
}
/** Cooperative retained candidate conflict observations, not publication/refresh
 * authority. readRegistry is a reviewed native adapter code port, never a saved
 * boolean or model/config hook; the host owns pre-acquisition byte/time limits.
 */
export function createCandidatePublicationReader({ api, readRegistry, repository, packageName, nativeProfile, candidateScope }) {
  choice(candidateScope, ['pending-chain', 'current-target']);
  const repo = jsonData({ id: id(own(repository, 'id')),
    full_name: text(own(repository, 'full_name'), /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 201) });
  text(packageName, /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/, 214);
  if (typeof api !== 'function' || typeof readRegistry !== 'function') fail();
  const releaseProfile = fields(jsonData(nativeProfile), ['markerPrefix', 'tagPrefixes']);
  text(releaseProfile.markerPrefix, /^[A-Za-z0-9_.-]+$/, 64); unique(array(releaseProfile.tagPrefixes, 4));
  if (!releaseProfile.tagPrefixes.length) fail();
  for (const prefix of releaseProfile.tagPrefixes) text(prefix, /^[A-Za-z0-9_.-]*$/, 32);
  const prefix = '/repos/' + repo.full_name;
  return async prepared => {
    const observations = []; let found = [];
    try {
      if (candidateScope === 'current-target' && own(prepared, 'packageName') !== packageName) fail();
      const versions = candidateVersions(prepared, candidateScope), tags = new Set(versions.flatMap(v => releaseProfile.tagPrefixes.map(prefix => prefix + v)));
      const read = async (method, route, body, project) => {
        if (method !== 'GET' || body !== undefined || observations.length >= 2048) fail();
        const item = { kind: 'candidate-native-read', method: 'GET', status: 'unavailable' }; observations.push(item);
        try {
          const data = jsonData(project(own(await api('GET', route), 'data')));
          item.status = 'projected'; item.digest = digest(data); return { data };
        } catch (error) {
          if (own(error, 'status') === 404) { item.status = 'not-found-at-read'; throw error; }
          throw error;
        }
      };
      const phase = async () => {
        const counts = { releases: 0, assets: 0 };
        const pages = (route, kind, project) => native.pages(async (method, url, body) => {
          const start = route + '?per_page=100&page=';
          if (!url.startsWith(start) || !/^[1-8]$/.test(url.slice(start.length))) fail();
          return read(method, url, body, raw => {
            array(raw, 100); counts[kind] += raw.length;
            if (counts[kind] > (kind === 'releases' ? 256 : 512)) fail();
            return Array.from({ length: raw.length }, (_, i) => project(own(raw, String(i))));
          });
        }, route);
        const releases = await pages(prefix + '/releases', 'releases', raw => ({
          id: id(own(raw, 'id')), tag: text(own(raw, 'tag_name'), /^[A-Za-z0-9_.-]+$/, 200),
          draft: boolean(own(raw, 'draft')), prerelease: boolean(own(raw, 'prerelease')) }));
        const assets = [], conflicts = [];
        const remember = row => { conflicts.push(row); if (!found.some(old => isDeepStrictEqual(old, row))) found.push(row); };
        const assetIds = new Set();
        for (const release of releases) {
          if (tags.has(release.tag)) remember({ kind: 'release', id: release.id, tag: release.tag });
          const rows = await pages(prefix + '/releases/' + release.id + '/assets', 'assets', raw => {
            const assetId = id(own(raw, 'id')); if (assetIds.has(assetId)) fail(); assetIds.add(assetId);
            return { id: assetId, name: text(own(raw, 'name'), /^[A-Za-z0-9_.-]+$/, 256),
              state: choice(own(raw, 'state'), ['uploaded', 'starter', 'open']), size: size(own(raw, 'size')), releaseId: release.id };
          });
          assets.push(...rows);
          for (const row of rows) for (const v of versions)
            if (row.name === releaseProfile.markerPrefix + v + '.json') remember({ kind: 'marker', id: row.id, releaseId: release.id, version: v });
        }
        const tagRows = [], registry = [];
        for (const tag of tags) {
          const route = prefix + '/git/ref/tags/' + encodeURIComponent(tag);
          const observed = await native.optional((method, url, body) => read(method, url, body, raw => {
            const object = own(raw, 'object'), sha = own(object, 'sha'); if (!control.validSha(sha)) fail();
            if (own(raw, 'ref') !== 'refs/tags/' + tag) fail();
            return { ref: 'refs/tags/' + tag, sha, type: choice(own(object, 'type'), ['commit', 'tag']) };
          }), route);
          tagRows.push({ tag, present: observed !== null });
          if (observed !== null) remember({ kind: 'tag', tag });
        }
        for (const v of versions) {
          if (observations.length >= 2048) fail();
          const item = { kind: 'candidate-registry-read', method: 'GET', version: v, status: 'unavailable' }; observations.push(item);
          const value = await readRegistry(v);
          if (value !== null && (typeof value !== 'object' || own(value, 'version') !== v ||
              typeof own(value, 'integrity') !== 'string' || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(own(value, 'integrity')))) fail();
          const row = { version: v, present: value !== null }; registry.push(row);
          item.status = 'projected'; item.digest = digest(row);
          if (value !== null) remember({ kind: 'registry', version: v });
        }
        return jsonData({ releases, assets, tags: tagRows, registry, conflicts });
      };
      const before = await phase(), after = await phase();
      if (!isDeepStrictEqual(before, after)) fail();
      if (found.length) return Object.freeze({ valid: false, reason: 'candidate-reservation-or-publication',
        conflicts: jsonData(found), authorized: false, retainedEligibilityAdmitted: false,
        observations: Object.freeze(observations.map(Object.freeze)) });
      return Object.freeze({ valid: true, scope: 'candidate-publication-conflicts-only', repository: repo, packageName, versions,
        releaseCount: before.releases.length, assetCount: before.assets.length, digest: digest(before),
        registryAbsenceOnlyAtRead: true, providerContinuityProved: false, erasedHistoryProved: false,
        retainedEligibilityAdmitted: false, authorized: false, observations: Object.freeze(observations.map(Object.freeze)) });
    } catch {
      return Object.freeze({ valid: false, reason: 'candidate-publication-unavailable', conflicts: jsonData(found),
        authorized: false, retainedEligibilityAdmitted: false, observations: Object.freeze(observations.map(Object.freeze)) });
    }
  };
}
/** Foottrace native registry adapter. Its unchanged reader owns HTTP status,
 * bounded bytes, JSON/package/version admission; no terminal predecessor replay.
 */
export function createFoottraceCandidatePublicationReader({ api, registry, repository, candidateScope }) {
  if (own(repository, 'full_name') !== 'footprintjs/foottrace' || typeof registry !== 'function') fail();
  return createCandidatePublicationReader({ api, repository, packageName: 'foottrace', candidateScope,
    nativeProfile: { markerPrefix: 'publish-attempt-', tagPrefixes: ['', 'v'] },
    readRegistry: v => native.registryVersion(v, registry(v)) });
}
