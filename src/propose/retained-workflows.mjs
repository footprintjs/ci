import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import native from '../guards/release-github.cjs';
import control from '../guards/release-control.cjs';
import { fields, jsonData, id, text, array, unique } from '../eco/json-data.mjs';
import { own } from './source-inventory.mjs';
const fail = () => { throw new Error('retained-workflow-unavailable'); };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const choice = (value, values) => { if (!values.includes(value)) fail(); return value; };
const sha = value => { if (!control.validSha(value)) fail(); return value; };
const bounded = (value, max) => { if (!Number.isSafeInteger(value) || value < 0 || value > max) fail(); return value; };
const statuses = ['completed', 'queued', 'in_progress', 'requested', 'waiting', 'pending', 'action_required'];
const conclusions = ['success', 'failure', 'neutral', 'cancelled', 'skipped', 'timed_out', 'action_required', 'stale', 'startup_failure'];
function terminal(value) {
  const status = choice(own(value, 'status'), statuses), conclusion = own(value, 'conclusion');
  if (status === 'completed') choice(conclusion, conclusions);
  else if (conclusion !== null) fail();
  return { status, conclusion };
}
function repository(value) {
  return { id: id(own(value, 'id')), full_name: text(own(value, 'full_name'), /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 201) };
}
function mapped(value, limit, project) {
  array(value, limit);
  // Read descriptors so a nominal provider array getter is not executed.
  return Array.from({ length: value.length }, (_, index) => project(own(value, String(index))));
}
/** Shared GET-only retained workflow observations. Profile is reviewed HOST CODE
 * data, never a saved record/config/model grant. This does not assess source
 * package versions, review/refusal state, releases/assets/registry reservations,
 * current private App/producer authority or erased/provider-continuous history.
 */
export function createRetainedWorkflowReader({ api, repository: repo, profile }) {
  const expected = repository(jsonData(repo)), p = fields(jsonData(profile),
    ['workflowPath', 'events', 'jobNames', 'effectJobNames']);
  text(p.workflowPath, /^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/, 256);
  for (const values of [p.events, p.jobNames, p.effectJobNames]) {
    unique(array(values, 32)); if (!values.length) fail();
    for (const value of values) text(value, /^[A-Za-z0-9_-]+$/, 100);
  }
  if (typeof api !== 'function' || p.effectJobNames.some(name => !p.jobNames.includes(name))) fail();
  const prefix = '/repos/' + expected.full_name, workflowRoute = prefix + '/actions/workflows/' + p.workflowPath.split('/').at(-1);
  return async () => {
    const observations = [];
    try {
      const read = async (route, project) => {
        if (observations.length >= 4096) fail();
        const item = { kind: 'retained-workflow-read', method: 'GET', status: 'unavailable' }; observations.push(item);
        const value = jsonData(project(own(await api('GET', route), 'data')));
        item.status = 'projected'; item.digest = digest(value); return value;
      };
      const page = async (route, key, maximum, project) => native.pages(async (method, url, body) => {
        if (method !== 'GET' || body !== undefined || !url.startsWith(route + '?per_page=100&page=') ||
            !/^[1-8]$/.test(url.slice((route + '?per_page=100&page=').length))) fail();
        return { data: await read(url, raw => ({ total_count: bounded(own(raw, 'total_count'), maximum),
          [key]: mapped(own(raw, key), Math.min(100, maximum), project) })) };
      }, route, key);
      const run = raw => {
        const runRepo = repository(own(raw, 'repository')), headRepo = repository(own(raw, 'head_repository'));
        if (!control.sameRepo(runRepo, expected) || !control.sameRepo(headRepo, expected)) fail();
        const attempt = id(own(raw, 'run_attempt')); if (attempt > 8) fail();
        return { id: id(own(raw, 'id')), workflow_id: id(own(raw, 'workflow_id')), run_attempt: attempt,
          head_sha: sha(own(raw, 'head_sha')), head_branch: text(own(raw, 'head_branch'), /^[A-Za-z0-9_.\/-]+$/, 200),
          event: choice(own(raw, 'event'), p.events), path: choice(own(raw, 'path'), [p.workflowPath]),
          ...terminal(raw), repository: runRepo, head_repository: headRepo };
      };
      const phase = async () => {
        const workflow = await read(workflowRoute, raw => ({ id: id(own(raw, 'id')),
          path: choice(own(raw, 'path'), [p.workflowPath]),
          state: choice(own(raw, 'state'), ['active', 'disabled_manually', 'disabled_inactivity', 'deleted']) }));
        const runs = await page(prefix + '/actions/workflows/' + workflow.id + '/runs', 'workflow_runs', 64, run);
        const attempts = [], artifacts = [], jobIds = new Set(), artifactIds = new Set(); let jobCount = 0;
        for (const row of runs) {
          if (row.workflow_id !== workflow.id) fail();
          const runPrefix = prefix + '/actions/runs/' + row.id;
          for (let attempt = 1; attempt <= row.run_attempt; attempt++) {
            const detail = await read(runPrefix + '/attempts/' + attempt, run);
            for (const key of ['id', 'workflow_id', 'head_sha', 'head_branch', 'event', 'path'])
              if (detail[key] !== row[key]) fail();
            if (detail.run_attempt !== attempt || (attempt === row.run_attempt && !isDeepStrictEqual(detail, row))) fail();
            const jobs = await page(runPrefix + '/attempts/' + attempt + '/jobs', 'jobs', 32, raw => {
              if (++jobCount > 512 || own(raw, 'run_id') !== row.id || own(raw, 'run_attempt') !== attempt ||
                  own(raw, 'head_sha') !== row.head_sha) fail();
              const jobId = id(own(raw, 'id')); if (jobIds.has(jobId)) fail(); jobIds.add(jobId);
              return { id: jobId, name: choice(own(raw, 'name'), p.jobNames),
                runId: row.id, attempt, sourceSha: row.head_sha, ...terminal(raw) };
            });
            attempts.push({ runId: row.id, attempt, sourceSha: row.head_sha,
              status: detail.status, conclusion: detail.conclusion, jobs });
          }
          const collected = await page(runPrefix + '/artifacts', 'artifacts', 64, raw => {
            const origin = own(raw, 'workflow_run');
            if (own(origin, 'id') !== row.id || own(origin, 'head_sha') !== row.head_sha ||
                own(origin, 'repository_id') !== expected.id || own(origin, 'head_repository_id') !== expected.id) fail();
            const expired = own(raw, 'expired'); if (typeof expired !== 'boolean') fail();
            const artifactId = id(own(raw, 'id')); if (artifactIds.has(artifactId)) fail(); artifactIds.add(artifactId);
            return { id: artifactId, name: text(own(raw, 'name'), /^[A-Za-z0-9_.-]+$/, 256),
              size: bounded(own(raw, 'size_in_bytes'), 64 * 1024 * 1024), expired, runId: row.id,
              sourceSha: row.head_sha, attemptBindingAdmitted: false };
          });
          if (artifacts.length + collected.length > 128) fail(); artifacts.push(...collected);
        }
        return jsonData({ workflow, runs, attempts, artifacts });
      };
      const before = await phase(), after = await phase();
      if (!isDeepStrictEqual(before, after)) fail();
      const nonterminal = [], effectStages = [];
      for (const attempt of before.attempts) {
        if (attempt.status !== 'completed' || attempt.jobs.some(job => job.status !== 'completed'))
          nonterminal.push({ runId: attempt.runId, attempt: attempt.attempt, sourceSha: attempt.sourceSha });
        for (const job of attempt.jobs)
          if (p.effectJobNames.includes(job.name) && job.conclusion !== 'skipped') effectStages.push(job);
      }
      return Object.freeze({ valid: true, scope: 'retained-workflow-observations-only', repository: jsonData(expected), ...before,
        nonterminal: jsonData(nonterminal), effectStages: jsonData(effectStages), digest: digest(before),
        providerContinuityProved: false, erasedHistoryProved: false, retainedEligibilityAdmitted: false, authorized: false,
        observations: Object.freeze(observations.map(Object.freeze)) });
    } catch {
      return Object.freeze({ valid: false, reason: 'retained-workflow-unavailable', authorized: false,
        retainedEligibilityAdmitted: false, observations: Object.freeze(observations.map(Object.freeze)) });
    }
  };
}
