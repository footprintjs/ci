import control from './release-control.cjs';

/** Synchronous witness adapter for the exact requireSecurity decision in
 * release-github.cjs:712-741. The native collector's workflowEvidence has already
 * completed all pages; callers must supply those completion flags here as well.
 * This preserves the mandatory CodeQL gate check without adding a second API or
 * history engine. The async runtime continues to use its original implementation.
 */
export function admitSecurity(w, identity, requiredJobs) {
  try {
    if (w?.runsComplete !== true || w.jobsComplete !== true ||
        !Array.isArray(w.runs) || !Array.isArray(w.jobs)) return false;
    const r = [...w.runs].sort((a, b) => b.id - a.id)[0];
    if (
      w.workflow.path !== '.github/workflows/codeql.yml' ||
      !r ||
      r.head_sha !== identity.headSha ||
      r.event !== 'pull_request' ||
      !control.sameRepo(r.head_repository, identity.repository) ||
      r.workflow_id !== w.workflow.id ||
      r.path !== w.workflow.path ||
      !control.success(r) ||
      !control.success(w.attempt) ||
      w.attempt.id !== r.id ||
      w.attempt.run_attempt !== r.run_attempt
    ) return false;
    for (const name of requiredJobs) {
      const jobs = w.jobs.filter((j) => j.name === name);
      if (
        jobs.length !== 1 ||
        !control.success(jobs[0]) ||
        jobs[0].run_id !== r.id ||
        jobs[0].run_attempt !== r.run_attempt
      ) return false;
    }
    return true;
  } catch { return false; }
}
