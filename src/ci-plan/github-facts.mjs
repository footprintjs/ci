const repositoryNames = new Set(['footprintjs/agentfootprint', 'footprintjs/footprint']);
const hex = /^[a-f0-9]{40}$/;
const positive = value => /^[1-9]\d*$/.test(String(value));
const producers = [];
const relevantWorkflow = run => /^\.github\/workflows\//.test(run.path ?? '')
  && !run.path.startsWith('.github/workflows/ci-plan.yml');

export function githubRead(token, request = globalThis.fetch) {
  return async route => {
    if (!route.startsWith('/repos/') || route.includes('\\') || route.split('/').includes('..')) {
      throw new Error('Invalid GitHub route');
    }
    const response = await request('https://api.github.com' + route, {
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: {
        accept: 'application/vnd.github+json', authorization: 'Bearer ' + token,
        'x-github-api-version': '2022-11-28',
      },
    });
    if (!response.ok) throw new Error('GitHub read failed (' + response.status + ')');
    return response.json();
  };
}

// Neither caller currently publishes a trusted per-cell receipt. The job's API
// supplies the checkout tree and actual jobs, and those observations stay distinct
// from a reusable receipt. Producer admission requires a reviewed revision.
export function receiptSources() {
  return {
    producers: Object.freeze([...producers]),
    reader: {
      receipt: async () => undefined,
      producerAttempt: async () => undefined,
      testedAttempt: async () => undefined,
    },
  };
}

function classifyJob(name, workflow) {
  if (/\bhold\b|release authorization/i.test(name)) return 'release-hold';
  if (/strict install/i.test(name)) return 'strict-install';
  if (/\bpeer\b/i.test(name)) return 'peer-check';
  if (/\bpack\b/i.test(name)) return 'pack';
  if (/\barchive\b/i.test(name)) return 'archive';
  if (/\bbuild\b/i.test(name)) return 'build';
  return workflow.startsWith('.github/workflows/consumers.yml') ? 'consumer' : 'other';
}

function pathEstimate(files) {
  if (!Array.isArray(files) || files.length >= 300) return;
  const visible = value => /^(?:src\/|package\.json$|package-lock\.json$)/.test(value);
  return {
    label: 'path estimate',
    consumerVisible: files.some(row => visible(row.filename ?? '') || visible(row.previous_filename ?? '')),
    verifiedPackageEquality: false,
  };
}

export async function gatherGithubFacts(env, get) {
  const repository = env.GITHUB_REPOSITORY;
  if (!repositoryNames.has(repository?.toLowerCase()) || !hex.test(env.GITHUB_SHA ?? '')
    || !hex.test(env.CI_PLAN_WORKFLOW_SHA ?? '') || !positive(env.GITHUB_RUN_ID)
    || !positive(env.GITHUB_RUN_ATTEMPT)) throw new Error('Unrecognized observe plan runner');
  const trigger = env.GITHUB_EVENT_NAME;
  const ref = env.GITHUB_REF;
  const pr = /^refs\/pull\/([1-9]\d*)\/merge$/.exec(ref ?? '');
  if (!(trigger === 'push' && ref === 'refs/heads/main') && !(trigger === 'pull_request' && pr)) {
    throw new Error('Unrecognized observe plan event');
  }

  const api = '/repos/' + repository;
  const runId = Number(env.GITHUB_RUN_ID);
  const attempt = Number(env.GITHUB_RUN_ATTEMPT);
  const [attemptMetadata, checkout] = await Promise.all([
    get(api + '/actions/runs/' + runId + '/attempts/' + attempt),
    get(api + '/git/commits/' + env.GITHUB_SHA),
  ]);
  const tree = checkout?.tree?.sha;
  const head = trigger === 'pull_request' ? checkout?.parents?.[1]?.sha : checkout?.sha;
  const base = checkout?.parents?.[0]?.sha;
  const association = attemptMetadata?.pull_requests ?? [];
  if (attemptMetadata?.id !== runId || attemptMetadata.run_attempt !== attempt || attemptMetadata.event !== trigger
    || attemptMetadata.repository?.full_name?.toLowerCase() !== repository.toLowerCase()
    || checkout?.sha !== env.GITHUB_SHA || !hex.test(head ?? '') || !hex.test(tree ?? '')
    || attemptMetadata.head_sha !== head
    || (pr && (checkout?.parents?.length !== 2 || association.length
      && !association.some(row => row.number === Number(pr[1]))))) {
    throw new Error('GitHub run and observed checkout do not match');
  }

  const [report, comparison] = await Promise.all([
    get(api + '/actions/runs?event=' + trigger + '&head_sha=' + head + '&per_page=50'),
    pr && hex.test(base ?? '') ? get(api + '/compare/' + base + '...' + head + '?per_page=1').catch(() => undefined) : undefined,
  ]);
  // Different pull requests can share a head; use an explicit association when the
  // host retains it, and require the same branch, head and event window otherwise.
  const runs = (report?.workflow_runs ?? []).filter(run => {
    if (run.id === runId || run.event !== trigger || run.head_sha !== head || !relevantWorkflow(run)
      || run.head_branch !== attemptMetadata.head_branch || run.head_repository?.id !== attemptMetadata.head_repository?.id
      || Math.abs(Date.parse(run.created_at) - Date.parse(attemptMetadata.created_at)) > 30_000
      || !positive(run.id) || !positive(run.run_attempt)) return false;
    return !pr || !run.pull_requests?.length || run.pull_requests.some(row => row.number === Number(pr[1]));
  }).slice(0, 16);
  const inventory = await Promise.all(runs.map(async run => ({
    run, response: await get(api + '/actions/runs/' + run.id + '/attempts/' + run.run_attempt + '/jobs?per_page=100'),
  })));

  const facts = { candidate: { repository, tree, trigger }, previousReceipts: [],
    pathEstimate: pathEstimate(comparison?.files) };
  const actualByCell = Object.create(null);
  const cells = inventory.flatMap(({ run, response }) => {
    return (response?.jobs ?? []).filter(job => positive(job.id) && typeof job.name === 'string'
      && job.run_id === run.id && job.run_attempt === run.run_attempt).map(job => {
      const id = run.workflow_id + ':' + job.id;
      actualByCell[id] = { cell: id, jobId: job.id, status: job.status, conclusion: job.conclusion };
      return { id, label: run.name + ' / ' + job.name, kind: classifyJob(job.name, run.path), inputsComplete: false };
    });
  });
  return { facts, cells, actualByCell, context: { repository, head, tree, runId, attempt, trigger,
    sharedWorkflowRevision: env.CI_PLAN_WORKFLOW_SHA,
    coverage: 'Only companion jobs already exposed by GitHub are listed. Missing cells run normally.',
    evidenceStatus: 'No approved per-cell receipt producer is registered for this rollout.',
    workflowRuns: inventory.map(({ run, response }) => ({ id: run.id, attempt: run.run_attempt,
      listed: response?.jobs?.length ?? 0, total: response?.total_count ?? null })),
    pathEstimate: facts.pathEstimate,
    cells: cells.map(({ id, label }) => ({ id, label })),
  } };
}
