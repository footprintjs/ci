import { createHash } from 'node:crypto';
import { jsonData, id, text, array, fields } from '../eco/json-data.mjs';
import preparation from '../guards/release-prepare.cjs';
import control from '../guards/release-control.cjs';
import { own } from './source-inventory.mjs';
import { candidateVersions } from './candidate-publication.mjs';
const fail = () => { throw new Error('retained-source-version-unavailable'); };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sha = value => { if (!control.validSha(value)) fail(); return value; };
const attemptId = value => { id(value); if (value > 8) fail(); return value; };
const terminal = value => {
  const status = own(value, 'status'), conclusion = own(value, 'conclusion');
  if (!['completed', 'queued', 'in_progress', 'requested', 'waiting', 'pending', 'action_required'].includes(status)) fail();
  if (status === 'completed') {
    if (!['success', 'failure', 'neutral', 'cancelled', 'skipped', 'timed_out', 'action_required', 'stale', 'startup_failure'].includes(conclusion)) fail();
  } else if (conclusion !== null) fail();
  return { status, conclusion };
};
/** Shared read-only source/version classification over the actual retained native
 * workflow reader output. Inputs are trusted code-port results, never saved grants.
 * Contents-at-commit is a cooperative provider path binding plus verified blob
 * bytes, not an independent Git Merkle-path proof or permission to mutate.
 */
export function createRetainedSourceVersionReader({ api, repository, packageName, profile, candidateScope }) {
  if (!['pending-chain', 'current-target'].includes(candidateScope)) fail();
  const repo = jsonData({ id: id(own(repository, 'id')),
    full_name: text(own(repository, 'full_name'), /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 201) });
  text(packageName, /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/, 214);
  const p = fields(jsonData(profile), ['workflowPath', 'events', 'jobNames', 'effectJobNames']);
  text(p.workflowPath, /^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/, 256);
  for (const names of [p.events, p.jobNames, p.effectJobNames]) {
    array(names, 32); if (!names.length || new Set(names).size !== names.length) fail();
    for (const name of names) text(name, /^[A-Za-z0-9_-]+$/, 100);
  }
  if (p.effectJobNames.some(name => !p.jobNames.includes(name)) || typeof api !== 'function') fail();
  return async (prepared, collection) => {
    const observations = [], candidateEffects = [];
    try {
      if (candidateScope === 'current-target' && own(prepared, 'packageName') !== packageName) fail();
      const versions = candidateVersions(prepared, candidateScope);
      if (own(collection, 'valid') !== true || own(collection, 'scope') !== 'retained-workflow-observations-only' ||
          own(collection, 'authorized') !== false || own(collection, 'retainedEligibilityAdmitted') !== false ||
          own(collection, 'providerContinuityProved') !== false || own(collection, 'erasedHistoryProved') !== false ||
          !control.sameRepo(own(collection, 'repository'), repo)) fail();
      const workflow = own(collection, 'workflow'), workflowId = id(own(workflow, 'id'));
      if (own(workflow, 'path') !== p.workflowPath) fail();
      const workflowDigest = text(own(collection, 'digest'), /^[a-f0-9]{64}$/, 64);
      const runs = own(collection, 'runs'), attempts = own(collection, 'attempts'); array(runs, 64); array(attempts, 512);
      const runMap = new Map(), expectedAttempts = new Set(), sources = new Map();
      for (let i = 0; i < runs.length; i++) {
        const run = own(runs, String(i)), runId = id(own(run, 'id')), sourceSha = sha(own(run, 'head_sha')), count = attemptId(own(run, 'run_attempt'));
        if (runMap.has(runId) || own(run, 'workflow_id') !== workflowId || own(run, 'path') !== p.workflowPath ||
            !p.events.includes(own(run, 'event')) || !control.sameRepo(own(run, 'repository'), repo) ||
            !control.sameRepo(own(run, 'head_repository'), repo)) fail();
        terminal(run); runMap.set(runId, { sourceSha, count });
        for (let attempt = 1; attempt <= count; attempt++) expectedAttempts.add(runId + ':' + attempt);
        if (!sources.has(sourceSha)) {
          const row = { kind: 'immutable-package-version', method: 'GET', sourceSha, status: 'unavailable' }; observations.push(row);
          const route = '/repos/' + repo.full_name + '/contents/package.json?ref=' + sourceSha;
          const raw = own(await api('GET', route), 'data'), size = own(raw, 'size'), encoded = own(raw, 'content'), blob = sha(own(raw, 'sha'));
          if (own(raw, 'type') !== 'file' || own(raw, 'name') !== 'package.json' || own(raw, 'path') !== 'package.json' ||
              own(raw, 'encoding') !== 'base64' || !Number.isSafeInteger(size) || size < 1 || size > 128 * 1024 ||
              typeof encoded !== 'string' || encoded.length > 180 * 1024 || !/^[A-Za-z0-9+/=\r\n]*$/.test(encoded)) fail();
          const bytes = Buffer.from(encoded, 'base64');
          if (bytes.length !== size || preparation.gitObject('blob', bytes) !== blob) fail();
          const pkg = JSON.parse(preparation.decodeRaw(bytes)), name = own(pkg, 'name'), version = own(pkg, 'version');
          if (name !== packageName) fail();
          text(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 100); preparation.parseVersion(version);
          const value = jsonData({ sourceSha, blobSha: blob, bytesSha256: createHash('sha256').update(bytes).digest('hex'), packageName, version });
          row.status = 'projected'; row.digest = digest(value); sources.set(sourceSha, value);
        }
      }
      const nonterminal = [], seenJobs = new Set(); let jobCount = 0;
      for (let i = 0; i < attempts.length; i++) {
        const raw = own(attempts, String(i)), runId = id(own(raw, 'runId')), attempt = attemptId(own(raw, 'attempt')),
          sourceSha = sha(own(raw, 'sourceSha')), key = runId + ':' + attempt, run = runMap.get(runId);
        if (!run || sourceSha !== run.sourceSha || !expectedAttempts.delete(key)) fail();
        const state = terminal(raw), jobs = own(raw, 'jobs'); array(jobs, 32); if (!jobs.length) fail();
        let active = state.status !== 'completed';
        const stages = [];
        for (let j = 0; j < jobs.length; j++) {
          if (++jobCount > 512) fail();
          const job = own(jobs, String(j)), jobId = id(own(job, 'id')), name = own(job, 'name'), status = terminal(job);
          if (seenJobs.has(jobId) || own(job, 'runId') !== runId || own(job, 'attempt') !== attempt ||
              own(job, 'sourceSha') !== sourceSha || !p.jobNames.includes(name)) fail();
          seenJobs.add(jobId); if (status.status !== 'completed') active = true;
          if (p.effectJobNames.includes(name) && status.conclusion !== 'skipped') stages.push({ jobId, name, ...status });
        }
        if (active) nonterminal.push({ runId, attempt, sourceSha });
        const version = sources.get(sourceSha).version;
        if (versions.includes(version) && stages.length) candidateEffects.push({ runId, attempt, sourceSha, version, stages });
      }
      if (expectedAttempts.size) fail();
      const owned = jsonData({ repository: repo, packageName, workflowDigest, versions,
        sources: [...sources.values()], attemptCount: attempts.length, nonterminalAttempts: nonterminal, candidateEffectAttempts: candidateEffects });
      if (candidateEffects.length) return Object.freeze({ valid: false, reason: 'candidate-effect-or-submission-uncertain',
        candidateEffectAttempts: owned.candidateEffectAttempts, authorized: false, retainedEligibilityAdmitted: false,
        observations: Object.freeze(observations.map(Object.freeze)) });
      return Object.freeze({ valid: true, scope: 'retained-source-versions-only', ...owned,
        digest: digest(owned), immutablePathBinding: 'provider-contents-at-commit',
        providerContinuityProved: false, erasedHistoryProved: false, retainedEligibilityAdmitted: false, authorized: false,
        observations: Object.freeze(observations.map(Object.freeze)) });
    } catch {
      return Object.freeze({ valid: false, reason: 'retained-source-version-unavailable',
        candidateEffectAttempts: jsonData(candidateEffects), authorized: false, retainedEligibilityAdmitted: false,
        observations: Object.freeze(observations.map(Object.freeze)) });
    }
  };
}
