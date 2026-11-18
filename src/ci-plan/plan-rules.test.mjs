import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlanRules } from './plan-rules.mjs';

const gitId = (letter) => letter.repeat(40);
const digest = (letter) => letter.repeat(64);
const tree = gitId('a');
const baseTree = gitId('b');
const workflowRevision = gitId('c');
const toolchain = { runnerImage: 'Ubuntu 24.04 20261112.1', nodeVersion: '22.22.0' };
const candidate = {
  repository: 'footprintjs/agentfootprint', tree, baseTree, workflowRevision,
  trigger: { event: 'pull_request', checkout: 'merge-candidate' }, toolchain,
};
const cell = {
  id: 'ci/build-and-test/lint/22', kind: 'lint', live: false,
  externalInputs: { lock: digest('d') }, inputsComplete: true, versionInputs: ['src/'],
};
const consumerInputs = { checkout: gitId('d'), configuration: digest('e'), dependencies: digest('f') };
const consumer = { ...cell, id: 'ci/consumer-compat', kind: 'consumer', consumerInputs };
const pack = { manifestDigest: digest('a'), membersDigest: digest('b') };
const packageProof = {
  baseTree, candidateTree: tree, buildRevision: gitId('e'), base: pack, candidate: { ...pack },
};
const modified = (path) => ({
  path, status: 'M', beforeMode: '100644', afterMode: '100644', parsed: true,
});
const lockBefore = {
  version: '1.0.0', lockfileVersion: 3,
  packages: {
    '': { version: '1.0.0', dependencies: { lib: '^2.0.0' } },
    'node_modules/lib': { version: '2.0.0', resolved: 'https://example.test/lib', integrity: 'sha512-value' },
  },
};
const lockAfter = structuredClone(lockBefore);
lockAfter.version = '1.0.1';
lockAfter.packages[''].version = '1.0.1';
const versionProof = {
  baseTree, candidateTree: tree, plannerRevision: gitId('f'), fragmentsDigest: digest('e'),
  candidateDiffDigest: digest('c'), plannerDiffDigest: digest('c'), inputClosureComplete: true,
  diffComplete: true,
  files: [modified('package.json'), modified('package-lock.json'), {
    path: '.changes/patch.md', status: 'D', beforeMode: '100644', afterMode: null,
    parsed: true, plannedFragmentDeletion: true,
  }],
  changedInputs: ['package.json', 'package-lock.json', '.changes/patch.md', 'generated/version.txt'],
  locks: { 'package-lock.json': { before: lockBefore, after: lockAfter } },
};

function fixture() {
  const verified = new WeakSet();
  const rules = createPlanRules({ isVerifiedReceipt: (value) => verified.has(value) });
  function receipt(check = cell, body = {}, prior = {}, approved = true) {
    const record = {
      receiptId: 'test-receipt-17', receiptDigest: digest('e'), repository: candidate.repository,
      tree, workflowRevision, trigger: candidate.trigger, toolchain, runId: 1729, attempt: 2,
      cells: [{ id: check.id, jobId: 123, outcome: 'success', externalInputs: check.externalInputs, ...prior }],
      ...body,
    };
    if (approved) verified.add(record);
    return record;
  }
  return { ...rules, receipt };
}

function expectRun(row, reasonCode) {
  assert.equal(row.decision, 'run');
  assert.equal(row.reasonCode, reasonCode);
  assert.ok(row.reason);
}

test('same inputs keeps each matrix cell independent and records the actual receipt and job', () => {
  const { planCell, receipt } = fixture();
  const row = planCell({ candidate, previousReceipts: [receipt()] }, cell);
  assert.equal(row.decision, 'would-skip');
  assert.equal(row.rule, 'same-inputs');
  assert.equal(row.evidence.receiptId, 'test-receipt-17');
  assert.equal(row.evidence.jobId, 123);
  assert.equal(row.evidence.tree, tree);
  expectRun(planCell({ candidate, previousReceipts: [receipt()] }, { ...cell, id: 'ci/build-and-test/lint/24' }), 'no-prior-success');
});

test('red-first rule 1: a different tree cannot prove same inputs', () => {
  const { planCell, receipt } = fixture();
  const row = planCell({ candidate, previousReceipts: [receipt(cell, { tree: baseTree })] }, cell);
  expectRun(row, 'tree-changed');
});

test('red-first trust: an unapproved receipt producer cannot self-attest or replay verification', () => {
  const { planCell, receipt } = fixture();
  const good = receipt();
  const forged = { ...structuredClone(good), verified: true, producer: 'approved' };
  const row = planCell({ candidate, previousReceipts: [forged] }, cell);
  expectRun(row, 'untrusted-receipt');
});

test('control: identical tree with a changed docs baseline or runner input runs', () => {
  const { planCell, receipt } = fixture();
  const docs = { ...cell, kind: 'docs', externalInputs: { baseline: baseTree } };
  expectRun(planCell({ candidate, previousReceipts: [receipt(docs, {}, { externalInputs: { baseline: gitId('e') } })] }, docs), 'external-inputs-changed');
  expectRun(planCell({ candidate, previousReceipts: [receipt(cell, { toolchain: { ...toolchain, runnerImage: 'Ubuntu 22.04' } })] }, cell), 'toolchain-changed');
});

test('same-input reuse requires a known trigger, successful unexpired cell and complete bound inputs', () => {
  const { planCell, receipt } = fixture();
  expectRun(planCell({ candidate, previousReceipts: [receipt(cell, { trigger: { event: 'push' } })] }, cell), 'trigger-changed');
  expectRun(planCell({ candidate, previousReceipts: [receipt(cell, { expired: true })] }, cell), 'expired-receipt');
  for (const outcome of ['cancelled', 'skipped', 'failure', undefined]) {
    expectRun(planCell({ candidate, previousReceipts: [receipt(cell, {}, { outcome })] }, cell), 'no-prior-success');
  }
  expectRun(planCell({ candidate, previousReceipts: [receipt()] }, { ...cell, inputsComplete: false }), 'unknown-cell-inputs');
  expectRun(planCell({ candidate, previousReceipts: [receipt()] }, { ...cell, inputsComplete: true, externalInputs: { baseline: null } }), 'unknown-cell-inputs');
  expectRun(planCell({ candidate, previousReceipts: [receipt(cell, { workflowRevision: gitId('d') })] }, cell), 'workflow-changed');
});

test('red-first rule 2: one additional changed file fails the exact planner diff', () => {
  const { planCell } = fixture();
  const changed = {
    ...versionProof, candidateDiffDigest: digest('f'), files: [...versionProof.files, modified('extra.md')],
    changedInputs: [...versionProof.changedInputs, 'extra.md'],
  };
  expectRun(planCell({ candidate, versionProof: changed }, cell), 'planner-diff-mismatch');
});

test('an exact version-only proof recognizes a consumed fragment and excludes declared inputs', () => {
  const { planCell } = fixture();
  const row = planCell({ candidate, versionProof }, cell);
  assert.equal(row.rule, 'version-only');
  assert.equal(row.decision, 'would-skip');
  assert.equal(row.evidence.diffDigest, versionProof.candidateDiffDigest);
  assert.equal(row.evidence.fragmentsDigest, versionProof.fragmentsDigest);
});

test('version-only proof rejects additions, renames, type changes, unparsed files and incomplete diffs', () => {
  const { planCell } = fixture();
  for (const bogus of [{ status: 'A' }, { status: 'R' }, { afterMode: '120000' }, { parsed: false }]) {
    const files = [{ ...versionProof.files[0], ...bogus }, ...versionProof.files.slice(1)];
    expectRun(planCell({ candidate, versionProof: { ...versionProof, files } }, cell), 'unsupported-version-diff');
  }
  const { plannerDiffDigest, ...incomplete } = versionProof;
  expectRun(planCell({ candidate, versionProof: incomplete }, cell), 'incomplete-version-proof');
  expectRun(planCell({ candidate, versionProof: { ...versionProof, diffComplete: false } }, cell), 'incomplete-version-proof');
  const files = [...versionProof.files.slice(0, 2), { ...versionProof.files[2], plannedFragmentDeletion: false }];
  expectRun(planCell({ candidate, versionProof: { ...versionProof, files } }, cell), 'unsupported-version-diff');
  expectRun(planCell({ candidate: { ...candidate, trigger: 'push' }, versionProof }, cell), 'version-rule-needs-pull-request');
});

test('version-only proof rejects any lock change outside the root version keys', () => {
  const { planCell } = fixture();
  const changes = [
    (after) => { after.packages[''].dependencies.lib = '~2.0.0'; },
    (after) => { after.packages[''].peerDependencies = { lib: '^2.0.0' }; },
    (after) => { after.packages['node_modules/lib'].resolved = 'https://example.test/lib-changed'; },
    (after) => { after.packages['node_modules/lib'].integrity = 'sha512-other'; },
    (after) => { after.packages['node_modules/extra'] = { version: '1.0.0' }; },
  ];
  for (const change of changes) {
    const after = structuredClone(lockAfter);
    change(after);
    const locks = { 'package-lock.json': { before: lockBefore, after } };
    expectRun(planCell({ candidate, versionProof: { ...versionProof, locks } }, cell), 'lock-inputs-changed');
  }
  expectRun(planCell({ candidate, versionProof: { ...versionProof, locks: {} } }, cell), 'missing-lock-proof');
});

test('control: a version-only bump that changes peer admission still runs all protected cells', () => {
  const { planCell, receipt } = fixture();
  const shipVersion = '2.0.0-rc.0';
  const shipLock = { ...lockAfter, version: shipVersion, packages: { ...lockAfter.packages, '': { ...lockAfter.packages[''], version: shipVersion } } };
  const releaseProof = { ...versionProof, locks: { 'package-lock.json': { before: lockBefore, after: shipLock } } };
  for (const kind of ['build', 'pack', 'archive', 'strict-install', 'peer-check']) {
    const protectedCell = { ...cell, kind, externalInputs: { ...cell.externalInputs, shipVersion, peerRange: '^1.0.0' } };
    const row = planCell({ candidate, versionProof: releaseProof, previousReceipts: [receipt(protectedCell)] }, protectedCell);
    expectRun(row, 'version-protected-cell');
    assert.equal(row.evidence.diffDigest, versionProof.candidateDiffDigest);
  }
  expectRun(planCell({ candidate, versionProof }, { ...consumer, versionInputs: ['package.json#version'] }), 'version-inputs-changed');
});

test('control: version-sensitive non-consumer cells read direct or generated inputs', () => {
  const { planCell } = fixture();
  for (const [kind, versionInputs] of [['test', ['package.json#version']], ['docs', ['generated/version.txt']], ['example', ['generated/']]]) {
    expectRun(planCell({ candidate, versionProof }, { ...cell, kind, versionInputs }), 'version-inputs-changed');
  }
  expectRun(planCell({ candidate, versionProof }, { ...cell, versionInputs: undefined }), 'unknown-version-inputs');
  expectRun(planCell({ candidate, versionProof }, { ...cell, versionInputs: ['generated/*'] }), 'unknown-version-inputs');
});

test('release hold, authorization and live inputs always run', () => {
  const { planCell, receipt } = fixture();
  for (const check of [{ ...cell, kind: 'release-hold' }, { ...cell, kind: 'release-authorization' }, { ...cell, live: true }]) {
    expectRun(planCell({ candidate, versionProof, previousReceipts: [receipt(check)] }, check), 'always-run');
  }
  expectRun(planCell({ candidate, previousReceipts: [receipt()] }, { ...cell, live: undefined }), 'unknown-cell-inputs');
});

test('red-first rule 3: missing exact packed evidence cannot be replaced with a path estimate', () => {
  const { planCell, receipt } = fixture();
  const prior = receipt(consumer, { tree: baseTree }, { consumerInputs, package: pack });
  const row = planCell({ candidate, previousReceipts: [prior], pathEstimate: 'no affected src paths' }, consumer);
  expectRun(row, 'missing-package-proof');
  assert.deepEqual(row.pathEstimate, { label: 'path estimate', value: 'no affected src paths' });
});

test('control: an edit outside src can change a shipped root file or generated member', () => {
  const { planCell, receipt } = fixture();
  const prior = receipt(consumer, { tree: baseTree }, { consumerInputs, package: pack });
  const changed = { ...packageProof, candidate: { ...pack, membersDigest: digest('f') } };
  expectRun(planCell({ candidate, previousReceipts: [prior], packageProof: changed, pathEstimate: 'no affected src paths' }, consumer), 'packed-package-changed');
});

test('control: identical pack images and consumer inputs still need a successful prior cell', () => {
  const { planCell, receipt } = fixture();
  expectRun(planCell({ candidate, packageProof }, consumer), 'no-prior-consumer-success');
  const cancelled = receipt(consumer, { tree: baseTree }, { consumerInputs, package: pack, outcome: 'cancelled' });
  expectRun(planCell({ candidate, packageProof, previousReceipts: [cancelled] }, consumer), 'no-prior-consumer-success');
});

test('equal-package reuse binds the exact tested pack plus consumer checkout, config and dependencies', () => {
  const { planCell, receipt } = fixture();
  const prior = receipt(consumer, { tree: baseTree }, { consumerInputs, package: pack });
  const facts = { candidate, packageProof, previousReceipts: [prior] };
  const row = planCell(facts, consumer);
  assert.equal(row.rule, 'equal-package');
  assert.equal(row.decision, 'would-skip');
  assert.equal(row.evidence.manifestDigest, pack.manifestDigest);
  assert.equal(row.evidence.jobId, 123);
  for (const key of Object.keys(consumerInputs)) {
    expectRun(planCell(facts, { ...consumer, consumerInputs: { ...consumerInputs, [key]: digest('d') } }), 'consumer-inputs-changed');
  }
  const otherPack = receipt(consumer, { tree: baseTree }, { consumerInputs, package: { ...pack, membersDigest: digest('f') } });
  expectRun(planCell({ ...facts, previousReceipts: [otherPack] }, consumer), 'prior-packed-package-changed');
});

test('same-tree consumer reuse also binds consumer inputs', () => {
  const { planCell, receipt } = fixture();
  const prior = receipt(consumer, {}, { consumerInputs });
  const facts = { candidate, previousReceipts: [prior] };
  assert.equal(planCell(facts, consumer).rule, 'same-inputs');
  expectRun(planCell(facts, { ...consumer, consumerInputs: undefined }), 'unknown-consumer-inputs');
  const changedConsumer = { ...consumer, consumerInputs: { ...consumerInputs, dependencies: digest('d') } };
  expectRun(planCell(facts, changedConsumer), 'consumer-inputs-changed');
});

test('control: a real observed failure makes the rule and cell ineligible until a verified control is rerun', () => {
  const { planCell, observeCell, receipt } = fixture();
  const facts = { candidate, previousReceipts: [receipt()] };
  const planned = planCell(facts, cell);
  const actual = { cell: cell.id, jobId: 456, status: 'completed', conclusion: 'failure' };
  const observed = observeCell(planned, actual);
  expectRun(observed, 'failed-control');
  assert.equal(observed.proposedDecision, 'would-skip');
  assert.equal(observed.verifiedSample, false);
  assert.deepEqual(observed.failedControl, { cell: cell.id, rule: 'same-inputs', jobId: 456 });
  expectRun(planCell({ ...facts, failedControls: [observed.failedControl] }, cell), 'failed-control');
});

test('an observe sample is verified only by the matching executed successful cell', () => {
  const { planCell, observeCell, receipt } = fixture();
  const planned = planCell({ candidate, previousReceipts: [receipt()] }, cell);
  const actual = { cell: cell.id, jobId: 456, status: 'completed', conclusion: 'success' };
  assert.equal(observeCell(planned, actual).verifiedSample, true);
  for (const other of [null, { ...actual, conclusion: 'skipped' }, { ...actual, status: 'in_progress' }, { ...actual, cell: 'another cell' }]) {
    const observed = observeCell(planned, other);
    assert.equal(observed.verifiedSample, false);
    assert.equal(observed.failedControl, undefined);
  }
});
