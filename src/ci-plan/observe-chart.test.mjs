import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gatherGithubFacts } from './github-facts.mjs';
import { runObserveChart } from './observe-chart.mjs';
import { createReceiptVerifier } from './receipt-verifier.mjs';

function receiptFixture() {
  const repository = 'footprintjs/agentfootprint';
  const tree = '1'.repeat(40);
  const producerRevision = 'a'.repeat(40);
  const workflowRevision = 'b'.repeat(40);
  const base = {
    schema: 1, receiptId: 'receipt-1', repository, tree, workflowRevision, workflowId: 90,
    trigger: 'pull_request', toolchain: { runnerImage: 'ubuntu-24.04:tested', nodeVersion: '24.21.0' },
    runId: 19, attempt: 2, expiresAt: '2027-01-01T00:00:00.000Z',
    cells: [{ id: 'lint/node-24', jobId: 123, outcome: 'success', externalInputs: {} }],
  };
  const bytes = Buffer.from(JSON.stringify(base));
  const digest = createHash('sha256').update(bytes).digest('hex');
  const source = { repository, workflowId: 91, workflowRevision: producerRevision, runId: 20, attempt: 1, bytes, digest };
  const producerAttempt = {
    repository, workflowId: 91, workflowRevision: producerRevision, runId: 20, attempt: 1,
    artifactDigest: digest, status: 'completed', conclusion: 'success', trigger: 'push',
  };
  const testedAttempt = {
    repository, tree, workflowId: 90, workflowRevision, runId: 19, attempt: 2, status: 'completed',
    jobs: [{ cell: 'lint/node-24', id: 123, status: 'completed', conclusion: 'success' }],
  };
  const producers = [{ repository, workflowId: 91, workflowRevision: producerRevision, testedRepository: repository, trigger: 'push' }];
  const reader = {
    receipt: async () => source,
    producerAttempt: async () => producerAttempt,
    testedAttempt: async () => testedAttempt,
  };
  const verifier = createReceiptVerifier({ reader, producers, now: () => Date.parse('2026-11-18T00:00:00Z') });
  const cell = { id: 'lint/node-24', kind: 'lint', live: false, externalInputs: {}, inputsComplete: true };
  return { verifier, source, producerAttempt, testedAttempt, base, cell };
}

test('the plan records an advisory per-cell decision only after a trusted receipt and actual job join', async () => {
  const { verifier, base, cell } = receiptFixture();
  const receipt = await verifier.verifyReceipt('known source');
  assert.ok(receipt);
  assert.equal(verifier.isVerifiedReceipt(structuredClone(receipt)), false);
  const record = await runObserveChart(async () => ({
    facts: { candidate: base, previousReceipts: [receipt] }, cells: [cell], context: {},
  }), verifier.isVerifiedReceipt);
  assert.equal(record.enforcement, false);
  assert.equal(record.route, 'observed');
  assert.equal(record.decisions[0].decision, 'would-skip');
  assert.equal(record.decisions[0].evidence.jobId, 123);
  assert.ok(record.chart.decisions.length > 0);
});

test('a receipt forged by caller code, changed digest, or wrong independently observed job is refused', async () => {
  const wrongSource = receiptFixture();
  wrongSource.source.workflowRevision = 'c'.repeat(40);
  assert.equal(await wrongSource.verifier.verifyReceipt('forged SHA'), undefined);
  const wrongDigest = receiptFixture();
  wrongDigest.producerAttempt.artifactDigest = 'c'.repeat(64);
  assert.equal(await wrongDigest.verifier.verifyReceipt('forged digest'), undefined);
  const wrongJob = receiptFixture();
  wrongJob.testedAttempt.jobs[0].conclusion = 'skipped';
  assert.equal(await wrongJob.verifier.verifyReceipt('missing successful job'), undefined);
});

test('GitHub facts use the observed merge tree and treat unknown coverage and path estimates as run', async () => {
  const sha = value => value.repeat(40);
  const env = { GITHUB_REPOSITORY: 'footprintjs/footPrint', GITHUB_SHA: sha('a'),
    GITHUB_EVENT_NAME: 'pull_request', GITHUB_REF: 'refs/pull/7/merge', GITHUB_RUN_ID: '4',
    GITHUB_RUN_ATTEMPT: '1', CI_PLAN_WORKFLOW_SHA: sha('b') };
  const run = { id: 4, run_attempt: 1, event: 'pull_request', head_sha: sha('c'), head_branch: 'topic',
    head_repository: { id: 9 }, repository: { full_name: env.GITHUB_REPOSITORY },
    pull_requests: [{ number: 7 }], created_at: '2026-11-18T08:00:00Z' };
  const get = async route => {
    if (route.includes('/git/commits/')) return { sha: sha('a'), tree: { sha: sha('d') },
      parents: [{ sha: sha('e') }, { sha: sha('c') }] };
    if (route.includes('/compare/')) return { files: [{ filename: 'docs/note.md' }] };
    if (route.includes('/jobs')) return { jobs: [{ id: 121, name: 'Lint', run_id: 5, run_attempt: 1,
      status: 'completed', conclusion: 'success' }] };
    if (route.includes('/actions/runs?')) return { workflow_runs: [{ ...run, id: 5, workflow_id: 10,
      name: 'CI', path: '.github/workflows/ci.yml' }] };
    if (route.includes('/attempts/')) return run;
    throw Error('Unexpected route ' + route);
  };
  const record = await runObserveChart(() => gatherGithubFacts(env, get), () => false);
  assert.equal(record.tree, sha('d'));
  assert.equal(record.decisions[0].decision, 'run');
  assert.equal(record.decisions[0].verifiedSample, false);
  assert.equal(record.pathEstimate.label, 'path estimate');
  assert.equal(record.pathEstimate.consumerVisible, false);
});
