import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import native from '../guards/release-github.cjs';
import preparation from '../guards/release-prepare.cjs';
import control from '../guards/release-control.cjs';
import { fields, jsonData, id, array } from '../eco/json-data.mjs';
import { own } from './source-inventory.mjs';
const fail = (reason = 'ordinary-preparation-unavailable') => { const error = new Error(reason); error.ordinaryReason = reason; throw error; };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Foottrace native ordinary-kind/source adapter. Reuses pinned sourceView and
 * sourceInput; never loads a helper from historical target Git data.
 * A valid active recovery namespace stays outside this ordinary refresh path.
 * Old-version intent data remains admitted by the native namespace schema.
 * Reviewed host API owns byte/time limits before acquisition; native sourceView
 * owns full Git inventory/blob/phase byte limits. This grants no writer authority.
 */
export function createFoottraceOrdinaryPreparationReader({ api, context }) {
  const pinned = fields(jsonData(context), ['repository', 'sha']);
  fields(pinned.repository, ['id', 'full_name']); id(pinned.repository.id);
  if (pinned.repository.full_name !== 'footprintjs/foottrace' || !control.validSha(pinned.sha) || typeof api !== 'function')
    throw new TypeError('ordinary-preparation-profile');
  return async prepared => {
    const observations = [];
    try {
      if (own(prepared, 'valid') !== true || own(prepared, 'sourceSha') !== pinned.sha) fail();
      const refs = own(prepared, 'preparationRefs'); array(refs, 8); if (!refs.length) fail();
      const specs = [];
      for (let i = 0; i < refs.length; i++) {
        const ref = own(refs, String(i));
        specs.push(jsonData({ kind: 'pending', sourceSha: own(ref, 'sourceSha'), sourceTree: own(ref, 'sourceTree'),
          targetTree: own(ref, 'pendingTree'), version: own(ref, 'version'), date: own(ref, 'preparationDate') }));
      }
      specs.push(jsonData({ kind: 'current', sourceSha: own(prepared, 'sourceSha'), sourceTree: own(prepared, 'sourceTree'),
        targetTree: own(prepared, 'targetTree'), version: own(prepared, 'version'), date: null }));
      for (const spec of specs) {
        if (![spec.sourceSha, spec.sourceTree, spec.targetTree].every(control.validSha)) fail();
        preparation.parseVersion(spec.version);
      }
      const sourceIds = new Set(specs.map(spec => spec.sourceSha)), prefix = '/repos/footprintjs/foottrace';
      const read = async (method, route, body) => {
        const base = prefix + '/git/', suffix = route.startsWith(base) ? route.slice(base.length) : '';
        if (method !== 'GET' || body !== undefined || observations.length >= 4096 ||
            !(suffix === 'ref/heads/main' || (suffix.startsWith('commits/') && sourceIds.has(suffix.slice(8))) ||
              /^trees\/[a-f0-9]{40}\?recursive=1$/.test(suffix) || /^blobs\/[a-f0-9]{40}$/.test(suffix))) fail();
        const row = { kind: 'native-ordinary-source', method: 'GET', status: 'unavailable' }; observations.push(row);
        const value = await api(method, route); row.status = 'native-input'; return value;
      };
      const phase = async () => {
        await native.assertCurrentMain(read, pinned);
        const view = native.sourceView(read, pinned), references = [];
        let priorQueue = null;
        for (const spec of specs) {
          const source = await native.sourceInput(read, { ...pinned, sha: spec.sourceSha }, view);
          if (source.commit.sha !== spec.sourceSha || source.commit.tree.sha !== spec.sourceTree ||
              source.pkg.version !== own(prepared, 'fromVersion') || !source.queue.length ||
              (spec.date !== null && spec.date !== source.date)) fail();
          if (source.intents.active.length !== 0) fail('ordinary-active-recovery');
          if (priorQueue !== null) preparation.requireQueueSubset(priorQueue, source.queue);
          priorQueue = source.queue;
          const actual = preparation.prepareRelease({ files: source.files, fragments: source.fragments, date: source.date });
          if (!actual || actual.version !== spec.version) fail();
          const candidate = new Map(source.inventory);
          for (const [path, text] of Object.entries(actual.updates)) {
            const bytes = Buffer.from(text); candidate.set(path, { mode: '100644', sha: preparation.gitObject('blob', bytes), bytes });
          }
          for (const path of actual.deletions) candidate.delete(path);
          if (preparation.treeOid(candidate) !== spec.targetTree ||
              (spec.kind === 'current' && !isDeepStrictEqual(jsonData(actual), jsonData(own(prepared, 'prepared'))))) fail();
          const inventory = [...source.inventory].map(([path, row]) => ({ path, mode: row.mode, sha: row.sha })).sort((a, b) => a.path.localeCompare(b.path));
          references.push(jsonData({ kind: spec.kind, sourceSha: spec.sourceSha, sourceTree: spec.sourceTree, targetTree: spec.targetTree,
            fromVersion: source.pkg.version, version: actual.version, preparationDate: source.date,
            queueDigest: digest(source.queue), inventoryDigest: digest(inventory), preparationDigest: digest(actual),
            archivedIntentRecords: source.intents.records.length }));
        }
        await native.assertCurrentMain(read, pinned);
        return jsonData({ repository: pinned.repository, references });
      };
      const before = await phase(), after = await phase();
      if (!isDeepStrictEqual(before, after)) fail();
      return Object.freeze({ valid: true, scope: 'native-ordinary-preparation-only', ...before, preparationKind: 'next',
        digest: digest(before), providerContinuityProved: false, erasedHistoryProved: false,
        retainedEligibilityAdmitted: false, privateAppIdentityAdmitted: false, authorized: false,
        observations: Object.freeze(observations.map(Object.freeze)) });
    } catch (error) {
      return Object.freeze({ valid: false, reason: own(error, 'ordinaryReason') === 'ordinary-active-recovery' ? 'ordinary-active-recovery' : 'ordinary-preparation-unavailable', nativeReason: native.refusalCode(error),
        retainedEligibilityAdmitted: false, privateAppIdentityAdmitted: false, authorized: false,
        observations: Object.freeze(observations.map(Object.freeze)) });
    }
  };
}
