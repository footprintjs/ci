import { isDeepStrictEqual } from 'node:util';

const alwaysRunKinds = new Set(['release-hold', 'release-authorization']);
const protectedVersionKinds = new Set(['build', 'pack', 'archive', 'strict-install', 'peer-check']);
const knownKinds = new Set([
  ...alwaysRunKinds, ...protectedVersionKinds, 'test', 'docs', 'example', 'lint', 'types', 'consumer', 'other',
]);
const failedConclusions = new Set(['failure', 'timed_out', 'startup_failure']);
const regularFileModes = new Set(['100644', '100755']);
const lockfile = /(?:^|\/)(?:package-lock|npm-shrinkwrap)\.json$/;

const reasons = {
  'always-run': 'This check depends on live state or release authorization.',
  'unknown-cell-inputs': 'The check has no complete declaration of its bound inputs or live-state use.',
  'unknown-candidate-inputs': 'The candidate has incomplete tree, workflow, trigger, or toolchain evidence.',
  'untrusted-receipt': 'The receipt has no independent verification from the approved producer.',
  'incomplete-receipt': 'A verified receipt is missing its required run or receipt identity.',
  'expired-receipt': 'The receipt has expired.',
  'no-prior-success': 'No eligible receipt records a successful execution of this check cell.',
  'no-prior-consumer-success': 'No eligible receipt records a successful execution of this consumer cell.',
  'repository-changed': 'The prior result belongs to a different repository.',
  'tree-changed': 'The prior result checked out a different tree.',
  'workflow-changed': 'The workflow revision differs from the prior result.',
  'trigger-changed': 'The trigger semantics differ from the prior result.',
  'toolchain-changed': 'The runner image or Node version differs from the prior result.',
  'external-inputs-changed': 'The cell’s bound external inputs are missing or differ from the prior result.',
  'version-rule-needs-pull-request': 'The version-only rule applies to a pull request merge candidate.',
  'incomplete-version-proof': 'The trusted release planner evidence is incomplete or belongs to another tree pair.',
  'planner-diff-mismatch': 'The complete candidate diff differs from the trusted release planner’s output.',
  'unsupported-version-diff': 'The candidate diff contains an unsupported file change or an unparsed file.',
  'missing-lock-proof': 'A changed lockfile has no parseable before and after evidence.',
  'lock-inputs-changed': 'The lockfile changes an input outside its root version fields.',
  'version-protected-cell': 'This check must run for the version and range that will ship.',
  'unknown-version-inputs': 'The change impact or the cell’s direct and indirect version inputs are incomplete.',
  'version-inputs-changed': 'The cell uses a value changed by the release planner, directly or through a generated file.',
  'missing-package-proof': 'The trusted build has no complete packed package comparison for this tree pair.',
  'packed-package-changed': 'The packed manifest or the set of packed member names, modes, and bytes changed.',
  'unknown-consumer-inputs': 'The consumer checkout, configuration, or dependency evidence is incomplete.',
  'consumer-inputs-changed': 'The consumer checkout, configuration, or dependencies differ from the prior result.',
  'prior-packed-package-changed': 'The prior successful consumer cell did not use this packed package.',
  'failed-control': 'The rule is disqualified for this cell by a failed observe-mode control.',
  'same-inputs': 'The same check cell succeeded with the same tree and all bound inputs.',
  'version-only': 'The trusted release planner reproduced the diff and the cell excludes all changed inputs.',
  'equal-package': 'The packed package and consumer inputs match those used by a prior successful cell.',
};

const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const isGitId = (value) => isText(value) && /^(?:[\da-f]{40}|[\da-f]{64})$/.test(value);
const isDigest = (value) => isText(value) && /^(?:sha256:)?[\da-f]{64}$/.test(value);
const isPositiveInteger = (value) => Number.isSafeInteger(value) && value > 0;

function isRecord(value) {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

// A plain JSON value with no unknown placeholders. An intentionally absent
// input can use a declared string such as "none".
function isBoundValue(value) {
  if (isText(value) || typeof value === 'boolean' || Number.isFinite(value)) return true;
  if (Array.isArray(value)) return Array.from(value).every(isBoundValue);
  return isRecord(value) && Object.values(value).every(isBoundValue);
}

function isInputMap(value) {
  return isRecord(value) && isBoundValue(value);
}

function isTrigger(value) {
  return isText(value) || (isInputMap(value) && isText(value.event));
}

function isToolchain(value) {
  return isInputMap(value) && isText(value.runnerImage) && isText(value.nodeVersion);
}

function isConsumerInputs(value) {
  return isInputMap(value) && isGitId(value.checkout) && isDigest(value.configuration) && isDigest(value.dependencies);
}

function isPack(value) {
  return isRecord(value) && isDigest(value.manifestDigest) && isDigest(value.membersDigest);
}

function samePack(left, right) {
  return left.manifestDigest === right.manifestDigest && left.membersDigest === right.membersDigest;
}

function receiptEvidence(receipt, prior) {
  const evidence = {
    receiptId: receipt.receiptId, receiptDigest: receipt.receiptDigest,
    repository: receipt.repository, runId: receipt.runId, attempt: receipt.attempt, jobId: prior.jobId,
    priorTree: receipt.tree, workflowRevision: receipt.workflowRevision,
    toolchain: receipt.toolchain, externalInputs: prior.externalInputs,
  };
  if (isConsumerInputs(prior.consumerInputs)) evidence.priorConsumerInputs = prior.consumerInputs;
  return evidence;
}

function priorResult(receipt, candidate, cell, pack, isVerifiedReceipt) {
  if (!isRecord(receipt) || isVerifiedReceipt(receipt) !== true) return { code: 'untrusted-receipt', matched: 0 };
  if (receipt.expired === true) return { code: 'expired-receipt', matched: 1 };
  if (!isText(receipt.receiptId) || !isDigest(receipt.receiptDigest) ||
      !isPositiveInteger(receipt.runId) || !isPositiveInteger(receipt.attempt)) {
    return { code: 'incomplete-receipt', matched: 2 };
  }

  const hits = Array.isArray(receipt.cells) ? receipt.cells.filter((prior) => prior?.id === cell.id) : [];
  const prior = hits.length === 1 ? hits[0] : undefined;
  if (prior?.outcome !== 'success' || !isPositiveInteger(prior.jobId)) {
    return { code: pack ? 'no-prior-consumer-success' : 'no-prior-success', matched: 3 };
  }

  const evidence = receiptEvidence(receipt, prior);
  const checks = [
    ['repository-changed', receipt.repository === candidate.repository],
    ['tree-changed', receipt.tree === (pack ? candidate.baseTree : candidate.tree)],
    ['workflow-changed', receipt.workflowRevision === candidate.workflowRevision],
    ['trigger-changed', isDeepStrictEqual(receipt.trigger, candidate.trigger)],
    ['toolchain-changed', isDeepStrictEqual(receipt.toolchain, candidate.toolchain)],
    ['external-inputs-changed', isDeepStrictEqual(prior.externalInputs, cell.externalInputs)],
  ];
  if (cell.kind === 'consumer') {
    checks.push(['consumer-inputs-changed', isDeepStrictEqual(prior.consumerInputs, cell.consumerInputs)]);
  }
  if (pack) {
    checks.push(['prior-packed-package-changed', isPack(prior.package) && samePack(prior.package, pack)]);
  }
  const failed = checks.findIndex(([, matches]) => !matches);
  return failed === -1 ? { eligible: true, evidence } : { code: checks[failed][0], matched: 4 + failed, evidence };
}

function findPrior(receipts, candidate, cell, pack, isVerifiedReceipt) {
  let nearest = { code: pack ? 'no-prior-consumer-success' : 'no-prior-success', matched: -1 };
  for (const receipt of Array.isArray(receipts) ? receipts : []) {
    const result = priorResult(receipt, candidate, cell, pack, isVerifiedReceipt);
    if (result.eligible) return result;
    if (result.matched > nearest.matched) nearest = result;
  }
  return nearest;
}

function lockWithoutRootVersions(lock) {
  if (!isRecord(lock) || !isText(lock.version)) return undefined;
  const { version: ignoredVersion, ...rest } = lock;
  if (!Object.hasOwn(rest, 'packages')) return rest;
  if (!isRecord(rest.packages) || !isRecord(rest.packages['']) || !isText(rest.packages[''].version)) return undefined;
  const { version: ignoredPackageVersion, ...root } = rest.packages[''];
  return { ...rest, packages: { ...rest.packages, '': root } };
}

function isVersionFile(file) {
  if (!isText(file?.path) || file.parsed !== true || !regularFileModes.has(file.beforeMode)) return false;
  if (file.path.split('/').some((component) => !component || component === '.' || component === '..')) return false;
  if (file.status === 'M') return file.beforeMode === file.afterMode;
  return file.status === 'D' && file.afterMode === null && file.plannedFragmentDeletion === true &&
    /^\.(?:changes|changeset)\/.+\.md$/.test(file.path);
}

function checkVersionProof(proof, candidate) {
  const evidence = {
    baseTree: proof?.baseTree, plannerRevision: proof?.plannerRevision, fragmentsDigest: proof?.fragmentsDigest,
    diffDigest: proof?.candidateDiffDigest, plannerDiffDigest: proof?.plannerDiffDigest,
  };
  const reject = (code) => ({ code, evidence });
  if (candidate.trigger !== 'pull_request' && candidate.trigger?.event !== 'pull_request') {
    return reject('version-rule-needs-pull-request');
  }
  if (proof?.diffComplete !== true || !isGitId(candidate.baseTree) || proof.baseTree !== candidate.baseTree || proof.candidateTree !== candidate.tree ||
      !isGitId(proof.plannerRevision) || !isDigest(proof.fragmentsDigest) || !isDigest(proof.candidateDiffDigest) ||
      !isDigest(proof.plannerDiffDigest) || !Array.isArray(proof.files) || proof.files.length === 0) {
    return reject('incomplete-version-proof');
  }
  if (proof.candidateDiffDigest !== proof.plannerDiffDigest) return reject('planner-diff-mismatch');
  if (!Array.from(proof.files).every(isVersionFile) || new Set(proof.files.map(({ path }) => path)).size !== proof.files.length) {
    return reject('unsupported-version-diff');
  }
  for (const { path } of proof.files) {
    if (!lockfile.test(path)) continue;
    const before = lockWithoutRootVersions(proof.locks?.[path]?.before);
    const after = lockWithoutRootVersions(proof.locks?.[path]?.after);
    if (!before || !after) return reject('missing-lock-proof');
    if (!isDeepStrictEqual(before, after)) return reject('lock-inputs-changed');
  }
  return { evidence, classification: 'version-only' };
}

function inputTouchesChange(input, changed) {
  // A file declaration covers its fields and a directory with a trailing slash
  // covers its children. The reverse checks cover file-level change evidence.
  return input === changed || input.startsWith(`${changed}#`) || changed.startsWith(`${input}#`) ||
    (input.endsWith('/') && changed.startsWith(input)) || (changed.endsWith('/') && input.startsWith(changed));
}

function proposedVersion(proof, cell) {
  if (protectedVersionKinds.has(cell.kind)) return 'version-protected-cell';
  const isInputName = (value) => isText(value) && !/[*?]/.test(value);
  if (proof.inputClosureComplete !== true || !Array.isArray(proof.changedInputs) || !Array.from(proof.changedInputs).every(isInputName) ||
      !proof.files.every(({ path }) => proof.changedInputs.includes(path)) ||
      !Array.isArray(cell.versionInputs) || !Array.from(cell.versionInputs).every(isInputName)) {
    return 'unknown-version-inputs';
  }
  const readsChangedInput = cell.versionInputs.some((input) => (
    proof.changedInputs.some((changed) => inputTouchesChange(input, changed))
  ));
  return readsChangedInput ? 'version-inputs-changed' : 'version-only';
}

function proposedEqualPack(facts, candidate, cell, isVerifiedReceipt) {
  const proof = facts.packageProof;
  if (!isGitId(candidate.baseTree) || proof?.baseTree !== candidate.baseTree || proof.candidateTree !== candidate.tree ||
      !isGitId(proof.buildRevision) || !isPack(proof.base) || !isPack(proof.candidate)) {
    return { code: 'missing-package-proof' };
  }
  const evidence = {
    baseTree: proof.baseTree, buildRevision: proof.buildRevision, manifestDigest: proof.candidate.manifestDigest,
    membersDigest: proof.candidate.membersDigest, baseManifestDigest: proof.base.manifestDigest,
    baseMembersDigest: proof.base.membersDigest,
  };
  if (!samePack(proof.base, proof.candidate)) return { code: 'packed-package-changed', evidence };
  const prior = findPrior(facts.previousReceipts, candidate, cell, proof.base, isVerifiedReceipt);
  return {
    code: prior.eligible ? 'equal-package' : prior.code,
    evidence: { ...prior.evidence, ...evidence, consumerInputs: cell.consumerInputs },
  };
}

// isVerifiedReceipt is injected by the trusted entry point. It recognizes only
// independently joined, unexpired receipts. Raw JSON has no authority here.
export function createPlanRules({ isVerifiedReceipt = () => false } = {}) {
  function planCell(facts = {}, cell = {}) {
    const row = { cell: cell.id, decision: 'run', rule: null };
    if (facts.pathEstimate !== undefined) row.pathEstimate = { label: 'path estimate', value: facts.pathEstimate };
    const candidate = { ...facts.candidate };
    for (const key of ['workflowRevision', 'trigger', 'toolchain']) {
      if (Object.hasOwn(cell, key)) candidate[key] = cell[key];
    }
    const finish = (code, evidence = {}, proposal) => {
      const failedControl = proposal && Array.isArray(facts.failedControls) && facts.failedControls.find(
        (control) => control?.cell === cell.id && control.rule === proposal && isPositiveInteger(control.jobId),
      );
      const reasonCode = failedControl ? 'failed-control' : code;
      const result = {
        ...row, decision: proposal && !failedControl ? 'would-skip' : 'run', rule: proposal ?? null,
        reasonCode, reason: reasons[reasonCode], evidence: { tree: candidate.tree, ...evidence },
      };
      if (failedControl) {
        result.proposedDecision = 'would-skip';
        result.failedControl = failedControl;
      }
      return result;
    };
    if (cell.live === true || alwaysRunKinds.has(cell.kind)) return finish('always-run');
    if (!isText(candidate.repository) || !isGitId(candidate.tree)) return finish('unknown-candidate-inputs');

    // Version-only handling keeps protected and version-sensitive cells running
    // even if a different rule would otherwise propose omitting them.
    let version;
    if (facts.versionProof !== undefined) {
      version = checkVersionProof(facts.versionProof, candidate);
      if (version.code) return finish(version.code, version.evidence);
      row.classification = version.classification;
      const code = proposedVersion(facts.versionProof, cell);
      if (code !== 'version-only') return finish(code, version.evidence);
    }

    if (!isText(cell.id) || !knownKinds.has(cell.kind) || cell.live !== false ||
        cell.inputsComplete !== true || !isInputMap(cell.externalInputs)) return finish('unknown-cell-inputs', version?.evidence);
    if (cell.kind === 'consumer' && !isConsumerInputs(cell.consumerInputs)) return finish('unknown-consumer-inputs', version?.evidence);
    if (!isGitId(candidate.workflowRevision) || !isTrigger(candidate.trigger) || !isToolchain(candidate.toolchain)) {
      return finish('unknown-candidate-inputs', version?.evidence);
    }
    if (version) return finish('version-only', version.evidence, 'version-only');

    const prior = findPrior(facts.previousReceipts, candidate, cell, undefined, isVerifiedReceipt);
    if (prior.eligible) return finish('same-inputs', prior.evidence, 'same-inputs');
    if (cell.kind !== 'consumer') return finish(prior.code, prior.evidence);

    const consumer = proposedEqualPack(facts, candidate, cell, isVerifiedReceipt);
    if (consumer.code === 'missing-package-proof' && ['untrusted-receipt', 'consumer-inputs-changed'].includes(prior.code)) {
      return finish(prior.code, prior.evidence);
    }
    return finish(consumer.code, consumer.evidence, consumer.code === 'equal-package' ? 'equal-package' : undefined);
  }

  return { planCell, observeCell };
}

function observeCell(plan, actual) {
  // The trusted report builder supplies the actual job joined to the expected
  // run attempt and cell. A workflow conclusion alone cannot verify a sample.
  const matches = actual?.cell === plan.cell && isPositiveInteger(actual.jobId) && actual.status === 'completed';
  const wouldSkip = plan.decision === 'would-skip';
  const result = { ...plan, actual: matches ? actual : null, verifiedSample: wouldSkip && matches && actual.conclusion === 'success' };
  if (!wouldSkip || !matches || !failedConclusions.has(actual.conclusion)) return result;

  return {
    ...result,
    decision: 'run',
    proposedDecision: 'would-skip',
    reasonCode: 'failed-control',
    reason: reasons['failed-control'],
    failedControl: { cell: plan.cell, rule: plan.rule, jobId: actual.jobId },
  };
}
