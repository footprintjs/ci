import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import native from '../guards/release-github.cjs';
import preparation from '../guards/release-prepare.cjs';
import control from '../guards/release-control.cjs';
import { jsonData, id } from '../eco/json-data.mjs';
import { foottraceInvocationContext } from './foottrace-context.mjs';
import { own } from './source-inventory.mjs';
const fail = () => { throw new Error('current-preparation-unavailable'); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => hash(JSON.stringify(value));
/** Native artifact admission through a reviewed GET-only host code port.
 * The host owns byte/time limits BEFORE acquisition. This layer bounds admitted
 * ZIP bytes and joins exact native current producer/manifest/proposal data.
 * It does not mint a writer credential, admit ordinary/recovery kind, or grant
 * retained eligibility. Public result contains references, never ZIP/payloads.
 */
export function createFoottraceCurrentPreparationReader({ api, context, artifactId, readCurrentProposer }) {
  let pinned;
  try {
    pinned = foottraceInvocationContext(context);id(artifactId);
    if (typeof api !== 'function' || typeof readCurrentProposer !== 'function') fail();
  } catch { pinned = null; }
  return async (prepared, currentIdentity) => {
    const observations = [];
    try {
      if (!pinned || own(prepared, 'valid') !== true || own(prepared, 'sourceSha') !== pinned.sha ||
          !control.validSha(own(prepared, 'sourceTree')) || !control.validSha(own(prepared, 'targetTree'))) fail();
      const identity = raw => {
        if (own(raw, 'valid') !== true || own(raw, 'scope') !== 'current-proposer-identity-only' ||
            own(raw, 'privateAppIdentityAdmitted') !== false || own(raw,'keyHolderIdentityFactsObserved')!==true || own(raw,'appIdentityObservation')!=='cached-key-holder-facts' || own(raw, 'authorized') !== false ||
            own(raw, 'writerCredentialBindingAdmitted') !== false || own(raw, 'retainedEligibilityAdmitted') !== false) fail();
        const value = jsonData(own(raw, 'identity'));
        if (value.repositoryId !== pinned.repository.id || value.sourceSha !== pinned.sha ||
            value.sourceTree !== prepared.sourceTree || value.runId !== pinned.runId || value.runAttempt !== pinned.runAttempt ||
            own(raw, 'digest') !== digest(value)) fail();
        id(value.prepareJobId); id(value.proposalJobId);
        return value;
      };
      const expectedIdentity = identity(currentIdentity), prefix = '/repos/footprintjs/foottrace', artifactRoute = prefix + '/actions/artifacts/' + artifactId;
      const proposal = jsonData({ base: pinned.sha, tree: prepared.sourceTree, repository: pinned.repository, prepared: own(prepared, 'prepared') });
      let total = 0;
      const phase = async () => {
        const fresh = identity(await readCurrentProposer(prepared));
        if (!isDeepStrictEqual(fresh, expectedIdentity)) fail();
        let metadata = null, archiveDigest = null;
        const read = async (method, route, body) => {
          const jobs = prefix + '/actions/runs/' + pinned.runId + '/attempts/' + pinned.runAttempt + '/jobs?per_page=100&page=';
          if (method !== 'GET' || body !== undefined || observations.length >= 24 ||
              !(route === artifactRoute || route === artifactRoute + '/zip' ||
                route === prefix + '/actions/runs/' + pinned.runId || (route.startsWith(jobs) && /^[1-8]$/.test(route.slice(jobs.length))))) fail();
          const row = { kind: 'native-current-archive', method: 'GET', status: 'unavailable' }; observations.push(row);
          const raw = own(await api(method, route), 'data');
          if (route === artifactRoute) {
            const run = own(raw, 'workflow_run');
            metadata = jsonData({ id: own(raw, 'id'), name: own(raw, 'name'), expired: own(raw, 'expired'),
              size: own(raw, 'size_in_bytes'), providerDigest: own(raw, 'digest') ?? null,
              workflow_run: { id: own(run, 'id'), head_sha: own(run, 'head_sha'), repository_id: own(run, 'repository_id'), head_repository_id: own(run, 'head_repository_id') } });
            if (!Number.isSafeInteger(metadata.size) || metadata.size < 1 || metadata.size > 20 * 1024 * 1024 ||
                metadata.workflow_run.head_repository_id !== pinned.repository.id ||
                (metadata.providerDigest !== null && !/^sha256:[a-f0-9]{64}$/.test(metadata.providerDigest))) fail();
            row.status = 'projected'; row.digest = digest(metadata);
            return { data: { ...metadata, size_in_bytes: metadata.size } };
          }
          if (route.endsWith('/zip')) {
            if (!(raw instanceof Uint8Array) || raw.byteLength < 1 || raw.byteLength > 20 * 1024 * 1024 ||
                (total += raw.byteLength) > 40 * 1024 * 1024 || !metadata || raw.byteLength !== metadata.size) fail();
            const bytes = Buffer.from(raw); archiveDigest = hash(bytes);
            if (metadata.providerDigest !== null && metadata.providerDigest !== 'sha256:' + archiveDigest) fail();
            row.status = 'projected'; row.digest = archiveDigest; return { data: bytes };
          }
          // These private bodies stay within the unchanged native producer
          // guard. Only the boundary status is recorded, never raw job fields.
          row.status = 'native-input'; return { data: raw };
        };
        const archive = await native.readArtifact(read, pinned, { tree: prepared.sourceTree, package: 'foottrace', version: prepared.version }, artifactId, 'prepare');
        const manifest = JSON.parse(preparation.decodeRaw(archive.members['manifest.json']));
        if (own(manifest, 'jobId') !== expectedIdentity.prepareJobId ||
            !isDeepStrictEqual(jsonData(JSON.parse(preparation.decodeRaw(archive.members['proposal.json']))), proposal)) fail();
        if (!isDeepStrictEqual(identity(await readCurrentProposer(prepared)), expectedIdentity)) fail();
        return jsonData({ artifactId, jobId: expectedIdentity.prepareJobId, repositoryId: pinned.repository.id,
          runId: pinned.runId, runAttempt: pinned.runAttempt, sourceSha: pinned.sha, sourceTree: prepared.sourceTree,
          targetTree: prepared.targetTree, version: prepared.version, archiveDigest, bytes: metadata.size,
          providerDigestPresent: metadata.providerDigest !== null, proposerDigest: digest(expectedIdentity) });
      };
      const before = await phase(), after = await phase();
      if (!isDeepStrictEqual(before, after)) fail();
      return Object.freeze({ valid: true, scope: 'current-preparation-archive-only', reference: before, digest: digest(before),
        providerDigestPresent: before.providerDigestPresent, writerCredentialBindingAdmitted: false, retainedEligibilityAdmitted: false, authorized: false,
        observations: Object.freeze(observations.map(Object.freeze)) });
    } catch (error) {
      return Object.freeze({ valid: false, reason: 'current-preparation-unavailable', nativeReason: native.refusalCode(error),
        writerCredentialBindingAdmitted: false, retainedEligibilityAdmitted: false, authorized: false,
        observations: Object.freeze(observations.map(Object.freeze)) });
    }
  };
}
