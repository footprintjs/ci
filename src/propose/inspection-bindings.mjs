import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { jsonData, fields, id } from '../eco/json-data.mjs';
import control from '../guards/release-control.cjs';
import { candidateVersions } from './candidate-publication.mjs';
import { own } from './source-inventory.mjs';
const digest = data => createHash('sha256').update(JSON.stringify(data)).digest('hex');
function readCount(result, max) {
  const rows = own(result, 'observations');
  if (!Array.isArray(rows) || rows.length > max) throw new Error('inspection-observations');
  return rows.length;
}
export function lineageBinding(result, prepared) {
  if (own(result, 'valid') !== true || own(result, 'scope') !== 'published-lineage-only' ||
      own(result, 'authorized') !== false || own(result, 'privateAppIdentityAdmitted') !== false)
    throw new Error('inspection-lineage');
  const proof = jsonData({ predecessor: own(result, 'predecessor'), version: own(result, 'version'),
    tree: own(result, 'tree'), archiveDigest: own(result, 'archiveDigest'), producer: own(result,'producer') });
  if (!isDeepStrictEqual(proof.predecessor, prepared.predecessor) || proof.version !== prepared.fromVersion ||
      proof.tree !== prepared.predecessor.tree || !/^[a-f0-9]{64}$/.test(proof.archiveDigest)) throw new Error('inspection-lineage-binding');
  const producer = fields(proof.producer,['runId','runAttempt']); id(producer.runId); id(producer.runAttempt);
  if (producer.runAttempt > 8) throw new Error('inspection-lineage-producer');
  return Object.freeze({ ...proof, count: readCount(result, 4096) });
}
export function ancestryBinding(result, prepared) {
  if (own(result, 'valid') !== true || own(result, 'scope') !== 'source-ancestry-only' ||
      own(result, 'authorized') !== false || own(result, 'sourceSha') !== prepared.sourceSha)
    throw new Error('inspection-ancestry');
  let from = prepared.predecessor.merge;
  const edges = prepared.preparationRefs.map(ref => { const edge = { from, to: ref.sourceSha }; from = ref.sourceSha; return edge; });
  edges.push({ from, to: prepared.sourceSha });
  const admitted = jsonData(own(result, 'edges'));
  if (!isDeepStrictEqual(admitted, jsonData(edges))) throw new Error('inspection-ancestry-binding');
  return Object.freeze({ sourceSha: prepared.sourceSha, edges: admitted, count: readCount(result, 92) });
}

export function reviewBinding(result, prepared, profile) {
  if (own(result, 'valid') !== true || own(result, 'scope') !== 'pending-reviews-only' ||
      own(result, 'authorized') !== false || own(result, 'privateAppIdentityAdmitted') !== false ||
      own(result, 'retainedEligibilityAdmitted') !== false || own(result, 'adjacentSnapshotOnly') !== true)
    throw new Error('inspection-reviews');
  const proof = jsonData({ reference: own(result, 'reference'), reviewCount: own(result, 'reviewCount'),
    reviewerCount: own(result, 'reviewerCount'), priorHeadApprovalReviews: own(result, 'priorHeadApprovalReviews'),
    reviewDigest: own(result, 'reviewDigest'), permissionDigest: own(result, 'permissionDigest') });
  const ref = fields(proof.reference, ['pr', 'botId', 'head', 'tree', 'source', 'observedBase', 'parents']);
  id(ref.pr); id(ref.botId);
  const refs = prepared.preparationRefs, last = refs.at(-1);
  const parents = [last.sourceSha];
  if (refs.length > 1) parents.push(refs.at(-2).pendingSha);
  else if (profile.originalParentLaw === 'published-predecessor') parents.push(prepared.predecessor.head);
  if (ref.head !== prepared.pendingSha || ref.tree !== prepared.pendingTree || ref.source !== prepared.sourceSha ||
      !control.validSha(ref.observedBase) || !isDeepStrictEqual(ref.parents, parents) ||
      !Number.isSafeInteger(proof.reviewCount) || proof.reviewCount < 0 || proof.reviewCount > 256 ||
      !Number.isSafeInteger(proof.reviewerCount) || proof.reviewerCount < 0 || proof.reviewerCount > 64 ||
      !Number.isSafeInteger(proof.priorHeadApprovalReviews) || proof.priorHeadApprovalReviews < 0 || proof.priorHeadApprovalReviews > proof.reviewCount ||
      !/^[a-f0-9]{64}$/.test(proof.reviewDigest) || !/^[a-f0-9]{64}$/.test(proof.permissionDigest))
    throw new Error('inspection-review-binding');
  return Object.freeze({ ...proof, count: readCount(result, 224) });
}


export function workflowBinding(result, prepared) {
  if (own(result, 'valid') !== true || own(result, 'scope') !== 'retained-workflow-observations-only' ||
      own(result, 'authorized') !== false || own(result, 'retainedEligibilityAdmitted') !== false ||
      own(result, 'providerContinuityProved') !== false || own(result, 'erasedHistoryProved') !== false)
    throw new Error('inspection-workflows');
  const repo = own(result, 'repository'), wf = own(result, 'workflow');
  const repository = jsonData({ id: own(repo, 'id'), full_name: own(repo, 'full_name') });
  id(repository.id);
  if (!prepared.preparationRefs.every(ref => ref.producer.repositoryId === repository.id) ||
      typeof repository.full_name !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository.full_name))
    throw new Error('inspection-workflow-repository');
  const workflow = jsonData({ id: own(wf, 'id'), path: own(wf, 'path'), state: own(wf, 'state') }); id(workflow.id);
  if (typeof workflow.path !== 'string' || workflow.path.length > 256 ||
      !/^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/.test(workflow.path) ||
      !['active', 'disabled_manually', 'disabled_inactivity', 'deleted'].includes(workflow.state))
    throw new Error('inspection-workflow-profile');
  const counts = {};
  for (const [name, limit] of [['runs', 64], ['attempts', 512], ['artifacts', 128], ['nonterminal', 512], ['effectStages', 512]]) {
    const rows = own(result, name); if (!Array.isArray(rows) || rows.length > limit) throw new Error('inspection-workflow-count');
    counts[name] = rows.length;
  }
  const receiptDigest = own(result, 'digest');
  if (typeof receiptDigest !== 'string' || !/^[a-f0-9]{64}$/.test(receiptDigest)) throw new Error('inspection-workflow-digest');
  return Object.freeze({ repository, workflow, ...counts, digest: receiptDigest, count: readCount(result, 4096) });
}


export function candidateBinding(result, prepared, profile) {
  if (own(result, 'valid') !== true || own(result, 'scope') !== 'candidate-publication-conflicts-only' ||
      own(result, 'authorized') !== false || own(result, 'retainedEligibilityAdmitted') !== false ||
      own(result, 'providerContinuityProved') !== false || own(result, 'erasedHistoryProved') !== false ||
      own(result, 'registryAbsenceOnlyAtRead') !== true || own(result, 'packageName') !== profile.packageName)
    throw new Error('inspection-candidate-publication');
  const rawRepo = own(result, 'repository'), repository = jsonData({ id: own(rawRepo, 'id'), full_name: own(rawRepo, 'full_name') });
  id(repository.id);
  if (!prepared.preparationRefs.every(ref => ref.producer.repositoryId === repository.id) ||
      typeof repository.full_name !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository.full_name))
    throw new Error('inspection-candidate-repository');
  const versions = jsonData(own(result, 'versions'));
  if (!isDeepStrictEqual(versions, candidateVersions(prepared, 'pending-chain'))) throw new Error('inspection-candidate-versions');
  const releaseCount = own(result, 'releaseCount'), assetCount = own(result, 'assetCount'), receiptDigest = own(result, 'digest');
  if (!Number.isSafeInteger(releaseCount) || releaseCount < 0 || releaseCount > 256 ||
      !Number.isSafeInteger(assetCount) || assetCount < 0 || assetCount > 512 ||
      typeof receiptDigest !== 'string' || !/^[a-f0-9]{64}$/.test(receiptDigest)) throw new Error('inspection-candidate-counts');
  return Object.freeze({ repository, versions, releaseCount, assetCount, digest: receiptDigest, count: readCount(result, 2048) });
}


export function sourceVersionBinding(result, prepared, workflows, collection, profile) {
  if (own(result, 'valid') !== true || own(result, 'scope') !== 'retained-source-versions-only' ||
      own(result, 'authorized') !== false || own(result, 'retainedEligibilityAdmitted') !== false ||
      own(result, 'providerContinuityProved') !== false || own(result, 'erasedHistoryProved') !== false ||
      own(result, 'immutablePathBinding') !== 'provider-contents-at-commit' ||
      own(result, 'workflowDigest') !== workflows.digest || own(result, 'packageName') !== profile.packageName)
    throw new Error('inspection-source-versions');
  const rawRepo = own(result, 'repository'), repo = jsonData({ id: own(rawRepo, 'id'), full_name: own(rawRepo, 'full_name') });
  if (!isDeepStrictEqual(repo, workflows.repository) ||
      !isDeepStrictEqual(jsonData(own(result, 'versions')), candidateVersions(prepared, 'pending-chain')) ||
      own(result, 'attemptCount') !== workflows.attempts) throw new Error('inspection-source-version-binding');
  const rows = own(result, 'sources'), runs = own(collection, 'runs');
  if (!Array.isArray(rows) || rows.length > 64 || !Array.isArray(runs) || runs.length > 64) throw new Error('inspection-source-count');
  const expected = new Set(runs.map(run => own(run, 'head_sha'))), seen = new Set(), sources = [];
  for (let i = 0; i < rows.length; i++) {
    const row = own(rows, String(i)), value = jsonData({ sourceSha: own(row, 'sourceSha'), blobSha: own(row, 'blobSha'),
      bytesSha256: own(row, 'bytesSha256'), packageName: own(row, 'packageName'), version: own(row, 'version') });
    if (!control.validSha(value.sourceSha) || !control.validSha(value.blobSha) ||
        typeof value.bytesSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.bytesSha256) ||
        value.packageName !== profile.packageName || typeof value.version !== 'string' ||
        !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value.version) ||
        !expected.has(value.sourceSha) || seen.has(value.sourceSha)) throw new Error('inspection-source-version');
    seen.add(value.sourceSha); sources.push(value);
  }
  if (seen.size !== expected.size) throw new Error('inspection-source-version-missing');
  const nonterminal = own(result, 'nonterminalAttempts'), effects = own(result, 'candidateEffectAttempts'), receiptDigest = own(result, 'digest');
  if (!Array.isArray(nonterminal) || nonterminal.length > workflows.attempts ||
      !Array.isArray(effects) || effects.length !== 0 || typeof receiptDigest !== 'string' || !/^[a-f0-9]{64}$/.test(receiptDigest))
    throw new Error('inspection-source-version-effects');
  return Object.freeze({ repository: repo, workflowDigest: workflows.digest, sourceCount: sources.length, sources: Object.freeze(sources),
    attemptCount: workflows.attempts, nonterminalCount: nonterminal.length, digest: receiptDigest, count: readCount(result, 64) });
}


export function retainedWitnessBinding(result, prepared, workflows) {
  if (own(result, 'valid') !== true || own(result, 'scope') !== 'retained-preparation-witnesses-only' ||
      own(result, 'authorized') !== false || own(result, 'retainedEligibilityAdmitted') !== false ||
      own(result, 'privateAppIdentityAdmitted') !== false || own(result, 'workflowDigest') !== workflows.digest)
    throw new Error('inspection-retained-witness');
  const rawRepo = own(result, 'repository'), repository = jsonData({ id: own(rawRepo, 'id'), full_name: own(rawRepo, 'full_name') });
  if (!isDeepStrictEqual(repository, workflows.repository)) throw new Error('inspection-witness-repository');
  const rows = own(result, 'witnesses');
  if (!Array.isArray(rows) || rows.length !== prepared.preparationRefs.length || rows.length > 8) throw new Error('inspection-witness-count');
  const witnesses = [];
  for (let index = 0; index < rows.length; index++) {
    const raw = own(rows, String(index)), ref = prepared.preparationRefs[index], producer = own(raw, 'producer');
    const expected = jsonData({ profileId: ref.profileId, sourceSha: ref.sourceSha, sourceTree: ref.sourceTree,
      pendingSha: ref.pendingSha, pendingTree: ref.pendingTree, preparationDate: ref.preparationDate,
      archiveDigest: ref.artifactDigest, producer: ref.producer, artifactAttemptFieldInvented: false });
    const projected = jsonData({ profileId: own(raw, 'profileId'), sourceSha: own(raw, 'sourceSha'), sourceTree: own(raw, 'sourceTree'),
      pendingSha: own(raw, 'pendingSha'), pendingTree: own(raw, 'pendingTree'), preparationDate: own(raw, 'preparationDate'),
      archiveDigest: own(raw, 'archiveDigest'), producer: {
        repositoryId: own(producer, 'repositoryId'), runId: own(producer, 'runId'), runAttempt: own(producer, 'runAttempt'),
        jobId: own(producer, 'jobId'), artifactId: own(producer, 'artifactId') }, artifactAttemptFieldInvented: own(raw, 'artifactAttemptFieldInvented') });
    if (!isDeepStrictEqual(projected, expected)) throw new Error('inspection-witness-identity');
    witnesses.push(projected);
  }
  const receiptDigest = own(result, 'digest');
  if (typeof receiptDigest !== 'string' || !/^[a-f0-9]{64}$/.test(receiptDigest)) throw new Error('inspection-witness-digest');
  return Object.freeze({ repository, workflowDigest: workflows.digest, witnesses: Object.freeze(witnesses),
    witnessCount: witnesses.length, digest: receiptDigest, count: readCount(result, 24) });
}


export function proposerBinding(result, prepared, reviews) {
  if (own(result, 'valid') !== true || own(result, 'scope') !== 'current-proposer-identity-only' ||
      own(result, 'authorized') !== false || own(result, 'retainedEligibilityAdmitted') !== false ||
      own(result, 'writerCredentialBindingAdmitted') !== false || own(result, 'privateAppIdentityAdmitted') !== false || own(result,'keyHolderIdentityFactsObserved')!==true || own(result,'appIdentityObservation')!=='cached-key-holder-facts')
    throw new Error('inspection-current-proposer');
  const value = fields(jsonData(own(result, 'identity')), ['repositoryId', 'sourceSha', 'sourceTree',
    'runId', 'runAttempt', 'prepareJobId', 'proposalJobId', 'appId', 'botId', 'appSettingsDigest']);
  for (const key of ['repositoryId', 'runId', 'runAttempt', 'prepareJobId', 'proposalJobId', 'appId', 'botId']) id(value[key]);
  if (!prepared.preparationRefs.every(ref => ref.producer.repositoryId === value.repositoryId) ||
      value.sourceSha !== prepared.sourceSha || value.sourceTree !== prepared.sourceTree || value.runAttempt > 8 ||
      value.prepareJobId === value.proposalJobId || value.botId !== reviews.reference.botId ||
      typeof value.appSettingsDigest !== 'string' || !/^[a-f0-9]{64}$/.test(value.appSettingsDigest))
    throw new Error('inspection-current-proposer-binding');
  const receiptDigest = own(result, 'digest');
  if (typeof receiptDigest !== 'string' || !/^[a-f0-9]{64}$/.test(receiptDigest)) throw new Error('inspection-proposer-digest');
  return Object.freeze({ identity: value, digest: receiptDigest, count: readCount(result, 32) });
}

export function currentPreparationBinding(result, prepared, proposer) {
  if (own(result, 'valid') !== true || own(result, 'scope') !== 'current-preparation-archive-only' ||
      own(result, 'authorized') !== false || own(result, 'writerCredentialBindingAdmitted') !== false ||
      own(result, 'retainedEligibilityAdmitted') !== false) throw new Error('inspection-current-preparation');
  const ref = fields(jsonData(own(result, 'reference')), ['artifactId', 'jobId', 'repositoryId', 'runId', 'runAttempt',
    'sourceSha', 'sourceTree', 'targetTree', 'version', 'archiveDigest', 'bytes', 'providerDigestPresent', 'proposerDigest']);
  id(ref.artifactId);
  for (const key of ['repositoryId', 'runId', 'runAttempt']) if (ref[key] !== proposer.identity[key]) throw new Error('inspection-current-archive-producer');
  if (ref.jobId !== proposer.identity.prepareJobId || ref.sourceSha !== prepared.sourceSha ||
      ref.sourceTree !== prepared.sourceTree || ref.targetTree !== prepared.targetTree || ref.version !== prepared.version ||
      ref.proposerDigest !== proposer.digest || typeof ref.archiveDigest !== 'string' || !/^[a-f0-9]{64}$/.test(ref.archiveDigest) ||
      !Number.isSafeInteger(ref.bytes) || ref.bytes < 1 || ref.bytes > 20 * 1024 * 1024 ||
      typeof ref.providerDigestPresent !== 'boolean' || own(result, 'providerDigestPresent') !== ref.providerDigestPresent)
    throw new Error('inspection-current-archive-binding');
  const receiptDigest = own(result, 'digest');
  if (typeof receiptDigest !== 'string' || !/^[a-f0-9]{64}$/.test(receiptDigest)) throw new Error('inspection-current-archive-digest');
  return Object.freeze({ reference: ref, digest: receiptDigest, count: readCount(result, 24) });
}

export function ordinaryPreparationBinding(result, prepared) {
  if (own(result, 'valid') !== true || own(result, 'scope') !== 'native-ordinary-preparation-only' ||
      own(result, 'preparationKind') !== 'next' || own(result, 'authorized') !== false ||
      own(result, 'retainedEligibilityAdmitted') !== false || own(result, 'privateAppIdentityAdmitted') !== false ||
      own(result, 'providerContinuityProved') !== false || own(result, 'erasedHistoryProved') !== false) throw new Error('inspection-ordinary-kind');
  const repository = fields(jsonData(own(result, 'repository')), ['id', 'full_name']); id(repository.id);
  if (!prepared.preparationRefs.every(ref => ref.producer.repositoryId === repository.id) ||
      typeof repository.full_name !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository.full_name)) throw new Error('inspection-ordinary-repository');
  const refs = own(result, 'references');
  if (!Array.isArray(refs) || refs.length !== prepared.preparationRefs.length + 1 || refs.length > 9) throw new Error('inspection-ordinary-count');
  const references = [];
  for (let i = 0; i < refs.length; i++) {
    const value = fields(jsonData(own(refs, String(i))), ['kind', 'sourceSha', 'sourceTree', 'targetTree', 'fromVersion', 'version',
      'preparationDate', 'queueDigest', 'inventoryDigest', 'preparationDigest', 'archivedIntentRecords']);
    const current = i === refs.length - 1, ref = current ? null : prepared.preparationRefs[i];
    if (value.kind !== (current ? 'current' : 'pending') || value.sourceSha !== (current ? prepared.sourceSha : ref.sourceSha) ||
        value.sourceTree !== (current ? prepared.sourceTree : ref.sourceTree) || value.targetTree !== (current ? prepared.targetTree : ref.pendingTree) ||
        value.fromVersion !== prepared.fromVersion || value.version !== (current ? prepared.version : ref.version) ||
        (!current && value.preparationDate !== ref.preparationDate) ||
        typeof value.preparationDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.preparationDate) ||
        !Number.isSafeInteger(value.archivedIntentRecords) || value.archivedIntentRecords < 0 || value.archivedIntentRecords > 100)
      throw new Error('inspection-ordinary-source');
    for (const key of ['queueDigest', 'inventoryDigest', 'preparationDigest'])
      if (typeof value[key] !== 'string' || !/^[a-f0-9]{64}$/.test(value[key])) throw new Error('inspection-ordinary-digest');
    if (current && (value.queueDigest !== digest(prepared.queue) || value.preparationDigest !== digest(prepared.prepared)))
      throw new Error('inspection-ordinary-reconstruction');
    references.push(value);
  }
  const receiptDigest = own(result, 'digest');
  if (typeof receiptDigest !== 'string' || !/^[a-f0-9]{64}$/.test(receiptDigest)) throw new Error('inspection-ordinary-receipt');
  return Object.freeze({ repository, references: Object.freeze(references), preparationKind: 'next', digest: receiptDigest, count: readCount(result, 4096) });
}

