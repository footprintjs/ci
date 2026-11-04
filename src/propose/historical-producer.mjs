import control from '../guards/release-control.cjs';
import preparation from '../guards/release-prepare.cjs';
import { fields, jsonData } from '../eco/json-data.mjs';

const unavailable = () => Object.freeze({ valid: false, reason: 'historical-preparation-unavailable' });
/** Structural binding only, never current-run authority or pending-release eligibility.
 * Expectations must come from a trusted package adapter and immutable source/queue preparation.
 * The adapter still owns complete provider reads, actual artifact bytes and full-tree witnesses.
 * JSON admission owns a fixed byte/work boundary; it does not sandbox Proxy code.
 */
export function admitHistoricalPreparationProducer(input) {
  try {
    const { expected: e, run, job, artifact, manifest } = jsonData(input);
    fields(e, ['repository', 'runId', 'runAttempt', 'jobId', 'artifactId', 'artifactName',
      'workflowPath', 'sourceSha', 'tree', 'package', 'version']);
    fields(e.repository, ['id', 'full_name']);
    if (!control.sameRepo(e.repository, e.repository) ||
        typeof e.repository.full_name !== 'string' || e.repository.full_name.length > 200 ||
        !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(e.repository.full_name) ||
        !control.validSha(e.sourceSha) || !control.validSha(e.tree) ||
        typeof e.artifactName !== 'string' || e.artifactName.length > 256 ||
        !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(e.artifactName) ||
        typeof e.workflowPath !== 'string' || e.workflowPath.length > 256 ||
        !/^\.github\/workflows\/[A-Za-z0-9][A-Za-z0-9_.-]*\.ya?ml$/.test(e.workflowPath) ||
        typeof e.package !== 'string' || e.package.length > 214 ||
        !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(e.package)) return unavailable();
    preparation.parseVersion(e.version);
    if (run.id !== e.runId || run.run_attempt !== e.runAttempt || run.head_sha !== e.sourceSha ||
        !control.sameRepo(run.repository, e.repository) || !control.sameRepo(run.head_repository, e.repository) ||
        run.path !== e.workflowPath || run.head_branch !== 'main' ||
        !['push', 'workflow_dispatch'].includes(run.event) || !control.success(run) ||
        job.head_sha !== e.sourceSha || artifact.workflow_run?.head_repository_id !== e.repository.id ||
        artifact.workflow_run?.head_branch !== 'main') return unavailable();
    const expected = { repositoryId: e.repository.id, runId: e.runId, runAttempt: e.runAttempt,
      jobId: e.jobId, jobName: 'prepare', artifactId: e.artifactId, artifactName: e.artifactName,
      sourceSha: e.sourceSha, tree: e.tree, package: e.package, version: e.version };
    // Same cooperative artifact/run/manifest projection as the existing current-run reader.
    // uploadArtifactId is this internal binding slot, not an independent GitHub job API field.
    if (!control.validateArtifactBinding({ expected, artifact,
      producer: { ...job, uploadArtifactId: artifact.id }, manifest }).valid) return unavailable();
    const binding = Object.freeze({ repositoryId: e.repository.id, runId: e.runId,
      runAttempt: e.runAttempt, jobId: e.jobId, artifactId: e.artifactId,
      sourceSha: e.sourceSha, tree: e.tree, package: e.package, version: e.version });
    return Object.freeze({ valid: true, binding });
  } catch { return unavailable(); }
}
