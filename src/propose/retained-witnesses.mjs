import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { fields, jsonData, id, text, array, unique } from '../eco/json-data.mjs';
import control from '../guards/release-control.cjs';
import { own } from './source-inventory.mjs';
const fail = () => { throw new Error('retained-preparation-witness-unavailable'); };
const sha = value => { if (!control.validSha(value)) fail(); return value; };
const hash = value => createHash('sha256').update(value).digest('hex');
const one = (rows, predicate) => {
  const matches = [];
  for (let i = 0; i < rows.length; i++) { const row = own(rows, String(i)); if (predicate(row)) matches.push(row); }
  if (matches.length !== 1) fail(); return matches[0];
};
/** Joins already decoded prepared-input witnesses to actual retained native
 * metadata, actual immutable Git identities and freshly downloaded artifact bytes.
 * Profile is explicit reviewed host code data; neither it nor these observations
 * replaces fresh private App/current producer/eligibility or effect admission.
 */
export function createRetainedWitnessReader({ api, repository, profile }) {
  const repo = jsonData({ id: id(own(repository, 'id')),
    full_name: text(own(repository, 'full_name'), /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 201) });
  const p = fields(jsonData(profile), ['id', 'workflowPath', 'prepareEvents', 'prepareJobName',
    'artifactLayout', 'artifactName', 'originalParentLaw', 'dateLaw']);
  text(p.id, /^[a-z][a-z0-9-]*$/, 80); text(p.workflowPath, /^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/, 256);
  text(p.prepareJobName, /^[A-Za-z0-9_-]+$/, 100); text(p.artifactName, /^[A-Za-z0-9_.-]+$/, 128);
  unique(array(p.prepareEvents, 4)); if (!p.prepareEvents.length) fail();
  for (const event of p.prepareEvents) text(event, /^[a-z_]+$/, 100);
  if (typeof api !== 'function' || !['run-attempt-job', 'literal'].includes(p.artifactLayout) ||
      !['source-only', 'published-predecessor'].includes(p.originalParentLaw) ||
      !['source-committer-day', 'native-evidence-day'].includes(p.dateLaw)) fail();
  return async (prepared, collection) => {
    const observations = [], witnesses = []; let totalBytes = 0;
    try {
      if (own(prepared, 'valid') !== true || own(prepared, 'profileId') !== p.id ||
          own(collection, 'valid') !== true || own(collection, 'scope') !== 'retained-workflow-observations-only' ||
          own(collection, 'authorized') !== false || own(collection, 'retainedEligibilityAdmitted') !== false ||
          own(collection, 'providerContinuityProved') !== false || own(collection, 'erasedHistoryProved') !== false ||
          !control.sameRepo(own(collection, 'repository'), repo) || own(own(collection, 'workflow'), 'path') !== p.workflowPath) fail();
      const workflowDigest = text(own(collection, 'digest'), /^[a-f0-9]{64}$/, 64), refs = own(prepared, 'preparationRefs');
      array(refs, 8); if (!refs.length) fail();
      const runs = array(own(collection, 'runs'), 64), attempts = array(own(collection, 'attempts'), 512), artifacts = array(own(collection, 'artifacts'), 128);
      const prefix = '/repos/' + repo.full_name;
      const read = async (kind, route, project) => {
        if (observations.length >= 24) fail();
        const item = { kind, method: 'GET', status: 'unavailable' }; observations.push(item);
        const value = jsonData(project(own(await api('GET', route), 'data')));
        item.status = 'projected'; item.digest = hash(JSON.stringify(value)); return value;
      };
      for (let index = 0; index < refs.length; index++) {
        const ref = own(refs, String(index)), producer = own(ref, 'producer');
        if (own(ref, 'profileId') !== p.id || own(producer, 'repositoryId') !== repo.id) fail();
        const runId = id(own(producer, 'runId')), attempt = id(own(producer, 'runAttempt')), jobId = id(own(producer, 'jobId')),
          artifactId = id(own(producer, 'artifactId')), sourceSha = sha(own(ref, 'sourceSha')), pendingSha = sha(own(ref, 'pendingSha'));
        if (attempt > 8) fail();
        const sourceTree = sha(own(ref, 'sourceTree')), pendingTree = sha(own(ref, 'pendingTree'));
        const archiveDigest = text(own(ref, 'artifactDigest'), /^[a-f0-9]{64}$/, 64);
        const day = text(own(ref, 'preparationDate'), /^\d{4}-\d\d-\d\d$/, 10);
        if (new Date(day).toISOString().slice(0, 10) !== day) fail();
        const run = one(runs, row => own(row, 'id') === runId);
        if (own(run, 'head_sha') !== sourceSha || own(run, 'path') !== p.workflowPath || own(run, 'head_branch') !== 'main' ||
            !p.prepareEvents.includes(own(run, 'event')) || !control.sameRepo(own(run, 'repository'), repo) ||
            !control.sameRepo(own(run, 'head_repository'), repo) || !Number.isSafeInteger(own(run, 'run_attempt')) ||
            own(run, 'run_attempt') < attempt || own(run, 'run_attempt') > 8) fail();
        const retainedAttempt = one(attempts, row => own(row, 'runId') === runId && own(row, 'attempt') === attempt);
        if (own(retainedAttempt, 'sourceSha') !== sourceSha || !control.success(retainedAttempt)) fail();
        const jobs = array(own(retainedAttempt, 'jobs'), 32), job = one(jobs, row => own(row, 'id') === jobId);
        if (own(job, 'name') !== p.prepareJobName || own(job, 'runId') !== runId || own(job, 'attempt') !== attempt ||
            own(job, 'sourceSha') !== sourceSha || !control.success(job)) fail();
        const artifact = one(artifacts, row => own(row, 'id') === artifactId);
        const expectedName = p.artifactLayout === 'literal' ? p.artifactName :
          p.artifactName + '-' + repo.id + '-' + runId + '-' + attempt + '-' + p.prepareJobName;
        const size = own(artifact, 'size');
        if (own(artifact, 'name') !== expectedName || own(artifact, 'runId') !== runId || own(artifact, 'sourceSha') !== sourceSha ||
            own(artifact, 'expired') !== false || !Number.isSafeInteger(size) || size < 1 || size > 20 * 1024 * 1024) fail();
        const source = await read('immutable-preparation-source', prefix + '/git/commits/' + sourceSha, raw => {
          const commitSha = sha(own(raw, 'sha')), tree = sha(own(own(raw, 'tree'), 'sha'));
          const sourceDay = p.dateLaw === 'source-committer-day' ?
            new Date(text(own(own(raw, 'committer'), 'date'), /^[0-9T:.Z+-]+$/, 40)).toISOString().slice(0, 10) : null;
          return { sha: commitSha, tree, sourceDay };
        });
        if (source.sha !== sourceSha || source.tree !== sourceTree || (p.dateLaw === 'source-committer-day' && source.sourceDay !== day)) fail();
        const parents = [sourceSha];
        if (index > 0) parents.push(sha(own(own(refs, String(index - 1)), 'pendingSha')));
        else if (p.originalParentLaw === 'published-predecessor') parents.push(sha(own(own(prepared, 'predecessor'), 'head')));
        const pending = await read('immutable-prepared-head', prefix + '/git/commits/' + pendingSha, raw => {
          const rawParents = array(own(raw, 'parents'), 2), parentShas = [];
          for (let i = 0; i < rawParents.length; i++) parentShas.push(sha(own(own(rawParents, String(i)), 'sha')));
          return { sha: sha(own(raw, 'sha')), tree: sha(own(own(raw, 'tree'), 'sha')), parents: parentShas };
        });
        if (pending.sha !== pendingSha || pending.tree !== pendingTree || !isDeepStrictEqual(pending.parents, parents)) fail();
        const item = { kind: 'actual-prepare-artifact', method: 'GET', artifactId, status: 'unavailable' }; observations.push(item);
        const bytes = own(await api('GET', prefix + '/actions/artifacts/' + artifactId + '/zip'), 'data');
        if (!Buffer.isBuffer(bytes) || bytes.length !== size || bytes.length > 20 * 1024 * 1024 ||
            (totalBytes += bytes.length) > 64 * 1024 * 1024 || hash(bytes) !== archiveDigest) fail();
        item.status = 'admitted'; item.archiveDigest = archiveDigest; item.bytes = bytes.length;
        witnesses.push(jsonData({ profileId: p.id, sourceSha, sourceTree, pendingSha, pendingTree, preparationDate: day,
          archiveDigest, producer: { repositoryId: repo.id, runId, runAttempt: attempt, jobId, artifactId }, artifactAttemptFieldInvented: false }));
      }
      const bound = jsonData({ repository: repo, workflowDigest, witnesses });
      return Object.freeze({ valid: true, scope: 'retained-preparation-witnesses-only', ...bound, digest: hash(JSON.stringify(bound)),
        retainedEligibilityAdmitted: false, privateAppIdentityAdmitted: false, authorized: false,
        observations: Object.freeze(observations.map(Object.freeze)) });
    } catch {
      return Object.freeze({ valid: false, reason: 'retained-preparation-witness-unavailable',
        retainedEligibilityAdmitted: false, authorized: false, observations: Object.freeze(observations.map(Object.freeze)) });
    }
  };
}
