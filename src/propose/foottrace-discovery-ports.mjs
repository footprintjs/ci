import gitBlob from '../guards/git-blob.cjs';
import { createHash } from 'node:crypto';
import native from '../guards/release-github.cjs';
import control from '../guards/release-control.cjs';
import { jsonData, id } from '../eco/json-data.mjs';
import { own, snapshotSource } from './source-inventory.mjs';
const fail = () => { throw new Error('native-discovery-unavailable'); };
/** Actual pinned native source reader and numbered-attempt/artifact acquisition.
 * Host transport owns pre-acquisition byte/time bounds. No historical helpers,
 * current-run status rewriting, job upload fields, or provider raw data in receipts.
 * One instance is one immutable discovery phase; surrounding effects use a fresh phase.
 */
export function createFoottraceDiscoveryPorts({ api, repository }) {
  const repo = jsonData({ id: id(own(repository, 'id')), full_name: own(repository, 'full_name') });
  if (repo.full_name !== 'footprintjs/foottrace' || typeof api !== 'function') throw new TypeError('native-discovery-profile');
  let requests = 0, archiveBytes = 0;
  const prefix = '/repos/' + repo.full_name;
  const read = async (method, route, body) => {
    if (method !== 'GET' || body !== undefined || ++requests > 4096 || !route.startsWith(prefix + '/')) fail();
    return api(method, route);
  };
  gitBlob.inheritGitBlobRead(read,api);
  const view = native.sourceView(read, { repository: repo });
  return {
    async readSource(sha) {
      const raw = await view.commit(sha), inventory = await view.inventory(sha);
      const source = { commit: jsonData({ sha: raw.sha, tree: { sha: raw.tree.sha },
        parents: raw.parents.map(row => ({ sha: row.sha })), committer: { date: raw.committer.date } }), inventory };
      snapshotSource(source); return source;
    },
    async readCandidateEvidence(candidate) {
      const { runId, runAttempt, jobId, artifactId, size, ...rest } = candidate;
      const expected = jsonData({ ...rest, runId, runAttempt, jobId, artifactId });
      const run = own(await read('GET', prefix + '/actions/runs/' + runId + '/attempts/' + runAttempt), 'data');
      const jobs = await native.pages(read, prefix + '/actions/runs/' + runId + '/attempts/' + runAttempt + '/jobs', 'jobs');
      if (jobs.length > 32) fail();
      const matching = jobs.filter(job => job.id === jobId);
      if (matching.length !== 1 || matching[0].name !== 'prepare' || !control.success(matching[0])) fail();
      const artifact = own(await read('GET', prefix + '/actions/artifacts/' + artifactId), 'data');
      if (artifact.id !== artifactId || artifact.size_in_bytes !== size || artifact.expired !== false ||
          !Number.isSafeInteger(size) || size < 1 || size > 20 * 1024 * 1024) fail();
      const archive = own(await read('GET', prefix + '/actions/artifacts/' + artifactId + '/zip'), 'data');
      if (!Buffer.isBuffer(archive) || archive.length !== size || (archiveBytes += archive.length) > 64 * 1024 * 1024) fail();
      if (artifact.digest !== undefined && artifact.digest !== null &&
          artifact.digest !== 'sha256:' + createHash('sha256').update(archive).digest('hex')) fail();
      // These actual provider fields feed the existing historical producer guard.
      // Unknown private provider metadata never enters owned evidence/digests.
      const projectRepo = value => ({ id: value?.id, full_name: value?.full_name });
      const ownedRun = jsonData({ id: run.id, run_attempt: run.run_attempt, head_sha: run.head_sha,
        repository: projectRepo(run.repository), head_repository: projectRepo(run.head_repository),
        path: run.path, head_branch: run.head_branch, event: run.event, status: run.status, conclusion: run.conclusion });
      const job = matching[0], ownedJob = jsonData({ id: job.id, name: job.name, run_id: job.run_id,
        run_attempt: job.run_attempt, head_sha: job.head_sha, status: job.status, conclusion: job.conclusion });
      const linked = artifact.workflow_run, ownedArtifact = jsonData({ id: artifact.id, name: artifact.name, expired: artifact.expired,
        workflow_run: { id: linked?.id, repository_id: linked?.repository_id, head_sha: linked?.head_sha, head_branch: linked?.head_branch,
          head_repository_id: linked?.head_repository_id } });
      return { evidence: { expected, run: ownedRun, job: ownedJob, artifact: ownedArtifact, archive: Buffer.from(archive) }, bytes: archive.length };
    }
  };
}
