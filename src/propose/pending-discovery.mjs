import { createHash } from 'node:crypto';
import control from '../guards/release-control.cjs';
import { jsonData, fields, id, array, text } from '../eco/json-data.mjs';
import { own, snapshotSource, semanticText } from './source-inventory.mjs';
import { packageProfile } from './package-profile.mjs';
import { createPendingPreparationChainReader } from './pending-chain.mjs';
const fail = (reason = 'pending-discovery-unavailable') => { const error = new Error(reason); error.discoveryReason = reason; throw error; };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sha = value => { if (!control.validSha(value)) fail(); return value; };
const reasons = new Set(['preparation-candidate-missing', 'preparation-candidate-ambiguous', 'pending-chain-hop-limit']);

/** Discovers candidates from a complete bounded native collection, never from a
 * caller-selected witness. Multiple possible native cohorts HOLD before download:
 * this conservative uniqueness law does not claim that metadata alone proves a
 * coherent preparation. Rich source/archive data remains outside recorded scope.
 * Published lineage and collection are separately admitted reader results, not
 * serialized grants. A fresh full facade must join/recheck them before any effect.
 */
export function createPendingWitnessDiscovery({ profile: inputProfile, nativeProfile, repository, readSource, readCandidateEvidence }) {
  const profile = packageProfile(inputProfile), chain = createPendingPreparationChainReader(profile);
  const p = fields(jsonData(nativeProfile), ['id', 'workflowPath', 'prepareEvents', 'prepareJobName',
    'artifactLayout', 'artifactName', 'originalParentLaw', 'dateLaw']);
  const repo = jsonData({ id: id(own(repository, 'id')), full_name: text(own(repository, 'full_name'), /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 201) });
  if (p.id !== profile.id || p.originalParentLaw !== profile.originalParentLaw || p.dateLaw !== profile.dateLaw ||
      !['literal', 'run-attempt-job'].includes(p.artifactLayout) || typeof readSource !== 'function' ||
      typeof readCandidateEvidence !== 'function') throw new TypeError('pending-discovery-profile');
  text(p.workflowPath, /^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/, 256);
  text(p.prepareJobName, /^[A-Za-z0-9_-]+$/, 100); text(p.artifactName, /^[A-Za-z0-9_.-]+$/, 128);
  array(p.prepareEvents, 4); if (!p.prepareEvents.length) throw new TypeError('pending-discovery-profile');
  for (const event of p.prepareEvents) text(event, /^[a-z_]+$/, 100);
  return async ({ pending, lineage, collection } = {}) => {
    const observations = [], references = []; let totalBytes = 0;
    try {
      if (own(pending, 'valid') !== true || own(pending, 'scope') !== 'pending-reference-only' ||
          own(lineage, 'valid') !== true || own(lineage, 'scope') !== 'published-lineage-only' ||
          own(collection, 'valid') !== true || own(collection, 'scope') !== 'retained-workflow-observations-only' ||
          own(collection, 'authorized') !== false || own(collection, 'retainedEligibilityAdmitted') !== false ||
          own(collection, 'providerContinuityProved') !== false || own(collection, 'erasedHistoryProved') !== false ||
          !control.sameRepo(own(collection, 'repository'), repo) || own(own(collection, 'workflow'), 'path') !== p.workflowPath) fail();
      const workflowDigest = text(own(collection, 'digest'), /^[a-f0-9]{64}$/, 64);
      const predecessor = fields(jsonData(own(lineage, 'predecessor')), ['pr', 'head', 'tree', 'merge']);
      id(predecessor.pr); [predecessor.head, predecessor.tree, predecessor.merge].forEach(sha);
      const reference = own(pending, 'reference'), head = sha(own(reference, 'head')), tree = sha(own(reference, 'tree'));
      const baseVersion = own(lineage, 'version');
      const runs = array(own(collection, 'runs'), 64), attempts = array(own(collection, 'attempts'), 512),
        artifacts = array(own(collection, 'artifacts'), 128);
      const seen = new Set(), heads = [];
      let cursor = head;
      while (cursor !== null && cursor !== predecessor.head) {
        if (heads.length >= 8) fail('pending-chain-hop-limit');
        if (seen.has(cursor) || cursor === predecessor.merge) fail();
        seen.add(cursor);
        const source = await readSource(cursor), snapshot = snapshotSource(source), commit = own(source, 'commit');
        const parents = array(own(commit, 'parents'), 2).map(row => sha(own(row, 'sha')));
        if (snapshot.sourceSha !== cursor || parents.length < 1 ||
            (cursor === head && (snapshot.sourceTree !== tree || digest(parents) !== digest(own(reference, 'parents'))))) fail();
        heads.push({ source, snapshot, parents });
        cursor = parents.length === 2 ? parents[1] : null;
      }
      if (!heads.length || (profile.originalParentLaw === 'published-predecessor' ? cursor !== predecessor.head : cursor !== null)) fail();
      const witnesses = [];
      for (const { source: pendingSource, snapshot: target, parents } of heads.reverse()) {
        const originalSource = await readSource(parents[0]), original = snapshotSource(originalSource);
        if (original.sourceSha !== parents[0]) fail();
        const pkg = jsonData(JSON.parse(semanticText(target.inventory, 'package.json')));
        if (pkg.name !== profile.packageName || typeof pkg.version !== 'string') fail();
        const candidates = [];
        for (const run of runs) {
          if (own(run, 'head_sha') !== original.sourceSha) continue;
          if (own(run, 'path') !== p.workflowPath || own(run, 'head_branch') !== 'main' ||
              !p.prepareEvents.includes(own(run, 'event')) || !control.sameRepo(own(run, 'repository'), repo) ||
              !control.sameRepo(own(run, 'head_repository'), repo)) fail();
          const runId = id(own(run, 'id')), maximum = id(own(run, 'run_attempt'));
          if (maximum > 8) fail();
          for (let attempt = 1; attempt <= maximum; attempt++) {
            const numbered = attempts.filter(row => own(row, 'runId') === runId && own(row, 'attempt') === attempt);
            if (numbered.length !== 1 || own(numbered[0], 'sourceSha') !== original.sourceSha) fail();
            if (!control.success(numbered[0])) {
              // A failed/running invocation with retained preparation bytes is
              // unresolved, never a nonmatching cohort that can be ignored.
              const name = p.artifactLayout === 'literal' ? p.artifactName :
                p.artifactName + '-' + repo.id + '-' + runId + '-' + attempt + '-' + p.prepareJobName;
              if (artifacts.some(artifact => own(artifact, 'runId') === runId && own(artifact, 'name') === name)) fail();
              continue;
            }
            const jobs = array(own(numbered[0], 'jobs'), 32).filter(job => own(job, 'name') === p.prepareJobName && control.success(job));
            if (jobs.length > 1) fail('preparation-candidate-ambiguous');
            if (!jobs.length) continue;
            const job = jobs[0], jobId = id(own(job, 'id'));
            if (own(job, 'runId') !== runId || own(job, 'attempt') !== attempt || own(job, 'sourceSha') !== original.sourceSha) fail();
            const name = p.artifactLayout === 'literal' ? p.artifactName :
              p.artifactName + '-' + repo.id + '-' + runId + '-' + attempt + '-' + p.prepareJobName;
            for (const artifact of artifacts) {
              if (own(artifact, 'runId') !== runId || own(artifact, 'name') !== name) continue;
              const size = own(artifact, 'size');
              if (own(artifact, 'sourceSha') !== original.sourceSha || own(artifact, 'expired') !== false ||
                  !Number.isSafeInteger(size) || size < 1 || size > 20 * 1024 * 1024) fail();
              candidates.push({ repository: repo, runId, runAttempt: attempt, jobId, artifactId: id(own(artifact, 'id')),
                artifactName: name, workflowPath: p.workflowPath, sourceSha: original.sourceSha,
                tree: original.sourceTree, package: profile.packageName, version: pkg.version, size });
            }
          }
        }
        observations.push({ kind: 'native-preparation-candidates', sourceSha: original.sourceSha, count: candidates.length });
        if (!candidates.length) fail('preparation-candidate-missing');
        if (candidates.length !== 1) fail('preparation-candidate-ambiguous');
        const selected = candidates[0], acquired = await readCandidateEvidence(selected);
        if (!Number.isSafeInteger(own(acquired, 'bytes')) || own(acquired, 'bytes') !== selected.size ||
            (totalBytes += own(acquired, 'bytes')) > 64 * 1024 * 1024) fail();
        const witness = { originalSource, pendingSource, evidence: own(acquired, 'evidence'), predecessor };
        witnesses.push(witness);
      }
      const admitted = chain({ witnesses, predecessor });
      if (!admitted.valid || admitted.pendingSha !== head || admitted.pendingTree !== tree ||
          admitted.hops.some(hop => hop.fromVersion !== baseVersion)) fail();
      for (const hop of admitted.hops) references.push(jsonData({ profileId: profile.id, sourceSha: hop.sourceSha,
        sourceTree: hop.sourceTree, pendingSha: hop.pendingSha, pendingTree: hop.pendingTree,
        preparationDate: hop.preparationDate, artifactDigest: hop.artifactDigest,
        producer: { repositoryId: hop.binding.repositoryId, runId: hop.binding.runId, runAttempt: hop.binding.runAttempt,
          jobId: hop.binding.jobId, artifactId: hop.binding.artifactId } }));
      const bound = jsonData({ repository: repo, profileId: profile.id, workflowDigest, head, tree, references });
      return Object.freeze({ valid: true, scope: 'pending-witness-discovery-only', ...bound, digest: digest(bound),
        authorized: false, retainedEligibilityAdmitted: false, privateAppIdentityAdmitted: false,
        backend: { pending: { witnesses, predecessor } }, observations, report: { count: references.length, digest: digest(bound) } });
    } catch (error) {
      let reason = 'pending-discovery-unavailable';
      try { const value = own(error, 'discoveryReason'); if (reasons.has(value)) reason = value; } catch { /* Non-object provider rejection stays finite. */ }
      return Object.freeze({ valid: false, reason,
        authorized: false, retainedEligibilityAdmitted: false, backend: null, observations, report: { count: 0 } });
    }
  };
}
