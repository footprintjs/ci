import { createHash } from 'node:crypto';
import control from '../guards/release-control.cjs';
import preparation from '../guards/release-prepare.cjs';
import { fields, jsonData, id, text, array, unique } from '../eco/json-data.mjs';
import { own } from './source-inventory.mjs';
const fail = (reason = 'retained-attempts-unavailable') => { const error = new Error(reason); error.retainedReason = reason; throw error; };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const statuses = ['completed', 'queued', 'in_progress', 'requested', 'waiting', 'pending', 'action_required'];
const conclusions = ['success', 'failure', 'neutral', 'cancelled', 'skipped', 'timed_out', 'action_required', 'stale', 'startup_failure'];
function state(raw) {
  const status = own(raw, 'status'), conclusion = own(raw, 'conclusion');
  if (!statuses.includes(status) || (status === 'completed' ? !conclusions.includes(conclusion) : conclusion !== null)) fail();
  return { status, conclusion };
}
function receipt(value) { return text(value, /^[a-f0-9]{64}$/, 64); }
/** Pure classification of ACTUAL retained native observations, not an authority
 * grant. The exact fresh producer/archive binding separates the current native
 * invocation; it does not relabel any historical run as running. Other attempts
 * must be terminal. Queued future jobs are accepted only in this same current
 * invocation, with no started/completed effect admitted.
 * Profile is reviewed host-code data, never model/config/saved grant input.
 */
export function createRetainedAttemptAssessor(profile) {
  let p;
  try {
    p = fields(jsonData(profile), ['workflowPath', 'events', 'jobNames', 'effectJobNames', 'prepareJobName',
      'proposalJobName', 'completedJobNames', 'futureJobNames', 'artifactNaming']);
    text(p.workflowPath, /^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/, 256);
    for (const values of [p.events, p.jobNames, p.effectJobNames, p.completedJobNames, p.futureJobNames]) {
      unique(array(values, 32)); if (!values.length) fail();
      for (const value of values) text(value, /^[A-Za-z0-9_-]+$/, 100);
    }
    if (!p.completedJobNames.includes(p.prepareJobName) || p.completedJobNames.includes(p.proposalJobName) ||
        p.futureJobNames.some(name => p.completedJobNames.includes(name) || name === p.proposalJobName) ||
        p.effectJobNames.some(name => !p.futureJobNames.includes(name))) fail();
    const roles = [...p.completedJobNames, p.proposalJobName, ...p.futureJobNames];
    if (new Set(roles).size !== p.jobNames.length || p.jobNames.some(name => !roles.includes(name))) fail();
    const naming = p.artifactNaming;
    if (own(naming, 'kind') === 'producer-cohort') {
      fields(naming, ['kind', 'prefix', 'role']); text(naming.prefix, /^[A-Za-z0-9_.-]+$/, 100); text(naming.role, /^[A-Za-z0-9_-]+$/, 100);
    } else if (own(naming, 'kind') === 'literal') { fields(naming, ['kind', 'value']); text(naming.value, /^[A-Za-z0-9_.-]+$/, 256); }
    else fail();
  } catch { p = null; }
  return ({ prepared, collection, versions, current, archive, published } = {}) => {
    try {
      if (!p || own(prepared, 'valid') !== true || own(collection, 'valid') !== true ||
          own(collection, 'scope') !== 'retained-workflow-observations-only' || own(collection, 'authorized') !== false ||
          own(collection, 'providerContinuityProved') !== false || own(collection, 'erasedHistoryProved') !== false) fail();
      const repository = fields(jsonData(own(collection, 'repository')), ['id', 'full_name']); id(repository.id);
      const workflow = own(collection, 'workflow'), workflowDigest = receipt(own(collection, 'digest'));
      if (own(workflow, 'path') !== p.workflowPath || own(workflow, 'state') !== 'active' ||
          own(versions, 'workflowDigest') !== workflowDigest) fail();
      id(own(workflow, 'id'));
      const identity = own(current, 'identity'), currentDigest = receipt(own(current, 'digest')), ref = own(archive, 'reference');
      for (const key of ['repositoryId', 'runId', 'runAttempt', 'prepareJobId', 'proposalJobId']) id(own(identity, key));
      if (identity.repositoryId !== repository.id || identity.sourceSha !== own(prepared, 'sourceSha') ||
          identity.sourceTree !== own(prepared, 'sourceTree') || identity.runAttempt > 8 ||
          identity.prepareJobId === identity.proposalJobId || ref.proposerDigest !== currentDigest ||
          ref.repositoryId !== identity.repositoryId || ref.runId !== identity.runId || ref.runAttempt !== identity.runAttempt ||
          ref.jobId !== identity.prepareJobId || ref.sourceSha !== identity.sourceSha || ref.sourceTree !== identity.sourceTree ||
          ref.targetTree !== own(prepared, 'targetTree') || ref.version !== own(prepared, 'version')) fail();
      id(ref.artifactId); receipt(ref.archiveDigest);
      if (!Number.isSafeInteger(ref.bytes) || ref.bytes < 1 || ref.bytes > 20 * 1024 * 1024) fail();
      const sourceRows = own(versions, 'sources'), sourceMap = new Map(); array(sourceRows, 64);
      for (let i = 0; i < sourceRows.length; i++) {
        const row = own(sourceRows, String(i)), sha = own(row, 'sourceSha'), version = own(row, 'version');
        if (!control.validSha(sha) || sourceMap.has(sha) || own(row, 'packageName') !== own(own(prepared, 'prepared'), 'package')) fail();
        preparation.parseVersion(version); sourceMap.set(sha, version);
      }
      const publication = fields(jsonData(published), ['predecessor','version','tree','archiveDigest','producer']);
      const predecessor = fields(publication.predecessor, ['pr','head','tree','merge']);
      id(predecessor.pr); receipt(publication.archiveDigest);
      const producer = fields(publication.producer,['runId','runAttempt']); id(producer.runId); id(producer.runAttempt);
      if (producer.runAttempt > 8) fail();
      for (const key of ['head','tree','merge']) if (!control.validSha(predecessor[key])) fail();
      const publishedSha = predecessor.merge, fromVersion = own(prepared,'fromVersion');
      if (publication.version !== fromVersion || publication.tree !== predecessor.tree) fail();
      preparation.parseVersion(fromVersion);
      const runs = own(collection, 'runs'), attempts = own(collection, 'attempts'), artifacts = own(collection, 'artifacts');
      array(runs, 64); array(attempts, 512); array(artifacts, 128);
      const runMap = new Map(), expected = new Set(), sourceIds = new Set(); let currentRun = null;
      for (let i = 0; i < runs.length; i++) {
        const run = own(runs, String(i)), runId = id(own(run, 'id')), count = id(own(run, 'run_attempt')), sha = own(run, 'head_sha');
        if (runMap.has(runId) || count > 8 || !control.validSha(sha) || !sourceMap.has(sha) ||
            run.workflow_id !== workflow.id || run.path !== p.workflowPath || !p.events.includes(run.event) ||
            run.head_branch !== 'main' || !control.sameRepo(run.repository, repository) || !control.sameRepo(run.head_repository, repository)) fail();
        state(run); runMap.set(runId, run); sourceIds.add(sha);
        for (let n = 1; n <= count; n++) expected.add(runId + ':' + n);
        if (runId === identity.runId) {
          if (run.run_attempt !== identity.runAttempt || sha !== identity.sourceSha ||
              run.status !== 'in_progress' || run.conclusion !== null || !['push', 'workflow_dispatch'].includes(run.event)) fail();
          currentRun = run;
        } else if (run.status !== 'completed') fail('retained-native-nonterminal');
      }
      if (!currentRun || sourceMap.size !== sourceIds.size || versions.attemptCount !== attempts.length) fail();
      const seenJobs = new Set(); let self = false, jobCount = 0;
      for (let i = 0; i < attempts.length; i++) {
        const attempt = own(attempts, String(i)), runId = id(own(attempt, 'runId')), number = id(own(attempt, 'attempt')), run = runMap.get(runId);
        if (!run || !expected.delete(runId + ':' + number) || own(attempt, 'sourceSha') !== run.head_sha) fail();
        const status = state(attempt), jobs = own(attempt, 'jobs'); array(jobs, 32); if (!jobs.length) fail();
        const currentAttempt = runId === identity.runId && number === identity.runAttempt, names = new Map();
        if (currentAttempt) {
          if (status.status !== 'in_progress' || status.conclusion !== null) fail();
          self = true;
        } else if (status.status !== 'completed') fail('retained-native-nonterminal');
        for (let n = 0; n < jobs.length; n++) {
          if (++jobCount > 512) fail();
          const job = own(jobs, String(n)), jobId = id(own(job, 'id')), name = own(job, 'name'), jobStatus = state(job);
          if (seenJobs.has(jobId) || job.runId !== runId || job.attempt !== number || job.sourceSha !== run.head_sha ||
              !p.jobNames.includes(name) || names.has(name)) fail();
          seenJobs.add(jobId); names.set(name, job);
          if (currentAttempt) {
            if (p.completedJobNames.includes(name)) {
              if (!control.success(job)) fail('current-native-stage-conflict');
            } else if (name === p.proposalJobName) {
              if (jobId !== identity.proposalJobId || jobStatus.status !== 'in_progress' || jobStatus.conclusion !== null) fail('current-native-stage-conflict');
            } else if (!((jobStatus.status === 'completed' && jobStatus.conclusion === 'skipped') ||
                         (jobStatus.status === 'queued' && jobStatus.conclusion === null))) fail('current-native-stage-conflict');
          } else {
            if (jobStatus.status !== 'completed') fail('retained-native-nonterminal');
            const version = sourceMap.get(run.head_sha), actualPublished = run.head_sha === publishedSha && version === fromVersion && runId === producer.runId && number === producer.runAttempt;
            if (!actualPublished && preparation.versionOrder(version, fromVersion) >= 0 &&
                p.effectJobNames.includes(name) && jobStatus.conclusion !== 'skipped') fail('retained-native-effect-or-submission');
          }
        }
        if (!currentAttempt && !(run.head_sha === publishedSha && sourceMap.get(run.head_sha) === fromVersion && runId === producer.runId && number === producer.runAttempt) &&
            preparation.versionOrder(sourceMap.get(run.head_sha), fromVersion) >= 0) {
          if (p.jobNames.some(name => !names.has(name))) fail('retained-native-history-incomplete');
          if (!['success','skipped'].includes(names.get(p.proposalJobName).conclusion))
            fail('retained-native-proposal-uncertain');
        }
        if (currentAttempt && (p.completedJobNames.some(name => !names.has(name)) || !names.has(p.proposalJobName) ||
            names.get(p.prepareJobName).id !== identity.prepareJobId)) fail('current-native-stage-conflict');
      }
      if (expected.size || !self) fail();
      const artifactName = p.artifactNaming.kind === 'literal' ? p.artifactNaming.value :
        p.artifactNaming.prefix + '-' + repository.id + '-' + identity.runId + '-' + identity.runAttempt + '-' + p.artifactNaming.role;
      const matched = artifacts.filter(row => own(row, 'id') === ref.artifactId);
      if (matched.length !== 1 || matched[0].runId !== identity.runId || matched[0].sourceSha !== identity.sourceSha ||
          matched[0].expired !== false || matched[0].name !== artifactName || matched[0].size !== ref.bytes ||
          matched[0].attemptBindingAdmitted !== false) fail();
      const owned = jsonData({ repository, workflowDigest, sourceVersionDigest: receipt(versions.digest), currentProposerDigest: currentDigest,
        currentArchiveDigest: ref.archiveDigest, publishedPredecessorDigest: digest(publication), retainedAttempts: attempts.length - 1, runCount: runs.length, sourceCount: sourceMap.size,
        current: { runId: identity.runId, runAttempt: identity.runAttempt, prepareJobId: identity.prepareJobId,
          proposalJobId: identity.proposalJobId, artifactId: ref.artifactId } });
      return Object.freeze({ valid: true, eligible: true, scope: 'retained-native-attempts-only', ...owned, digest: digest(owned),
        currentInvocationSeparated: true, providerContinuityProved: false, erasedHistoryProved: false,
        retainedEligibilityAdmitted: false, authorized: false });
    } catch (error) {
      const reasons = ['retained-native-nonterminal', 'retained-native-effect-or-submission', 'current-native-stage-conflict', 'retained-native-history-incomplete', 'retained-native-proposal-uncertain'];
      const reason = own(error, 'retainedReason');
      return Object.freeze({ valid: false, eligible: false, reason: reasons.includes(reason) ? reason : 'retained-attempts-unavailable',
        providerContinuityProved: false, erasedHistoryProved: false, retainedEligibilityAdmitted: false, authorized: false });
    }
  };
}
