// Synthetic provider observations; no real artifact or actual release eligibility is claimed.
export function producerFixture() {
  const repository = { id: 123, full_name: 'footprintjs/foottrace' };
  const expected = { repository, runId: 456, runAttempt: 1, jobId: 789, artifactId: 900,
    artifactName: 'foottrace-123-456-1-prepare', workflowPath: '.github/workflows/publish.yml',
    sourceSha: 'a'.repeat(40), tree: 'b'.repeat(40), package: 'foottrace', version: '1.10.1' };
  const run = { id: 456, run_attempt: 1, repository, head_repository: repository,
    head_sha: expected.sourceSha, path: expected.workflowPath, head_branch: 'main', event: 'push',
    status: 'completed', conclusion: 'success' };
  const job = { id: 789, name: 'prepare', run_id: 456, run_attempt: 1, head_sha: expected.sourceSha,
    status: 'completed', conclusion: 'success' };
  const artifact = { id: 900, name: expected.artifactName, expired: false, workflow_run: {
    id: 456, repository_id: 123, head_repository_id: 123, head_sha: expected.sourceSha, head_branch: 'main' } };
  const manifest = { repositoryId: 123, runId: 456, runAttempt: 1, jobId: 789,
    sourceSha: expected.sourceSha, tree: expected.tree, package: expected.package, version: expected.version };
  return { expected, run, job, artifact, manifest };
}
