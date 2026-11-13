// The two route workflows, read once with the strict YAML subset, and the small vocabulary the
// tests share: the pins this repository uses, the tool guard, and the run simulator that turns
// the jobs' `if:` conditions into which jobs run.
import { readFileSync } from 'node:fs';
import { evaluate, parseCondition } from './expression.mjs';
import { parseYaml } from './yaml-subset.mjs';

export const readWorkflow = (name) => {
  const text = readFileSync(`.github/workflows/${name}`, 'utf8');
  return { text, yaml: parseYaml(text) };
};

// Every action the route workflows use, by full commit, with the release the commit belongs to
// (the comment beside each `uses:`). Each is the newest release that runs on Node 24 (its
// action.yml says `runs.using: node24`) and was at least 14 days old on 2026-11-12, when they were
// chosen; the commit is the tag's, read with `git ls-remote https://github.com/actions/<name>
// refs/tags/<tag> refs/tags/<tag>^{}` (each a lightweight tag, so the ref line is the commit), and
// the release date from GitHub's API (repos/actions/<name>/releases). The v4 pins they replace
// (v4.2.2, v4.4.0, v4.6.2, v4.3.0) ran on Node 20, which GitHub forced onto Node 24 with a warning
// in every job (storydeck's first runs, 13 Nov 2026).
//   checkout v7.0.1 (2026-07-20), setup-node v7.1.0 (2026-10-08),
//   upload-artifact v7.0.2 (2026-10-07), download-artifact v8.0.2 (2026-10-07).
// The other workflows of this repository keep their own pins (not part of the route).
export const PINS = Object.freeze({
  'actions/checkout': ['3d3c42e5aac5ba805825da76410c181273ba90b1', 'v7.0.1'],
  'actions/setup-node': ['949feb2413d6458794dcd2491c4babbbce0c15c1', 'v7.1.0'],
  'actions/upload-artifact': ['cf430e030ddbb5b0abf93d22962f4752f3646cd9', 'v7.0.2'],
  'actions/download-artifact': ['9000827ccba6bdab643e8b6fd33ac0654aef8333', 'v8.0.2'],
});

// setup-node v5 and later restore (and, in a post step, save) an npm cache by themselves when the
// workspace's package.json names npm in `packageManager` or `devEngines.packageManager`
// (setup-node v7.1.0, src/main.ts · getNameFromPackageManagerField reads
// $GITHUB_WORKSPACE/package.json). The route's workspace holds only the `source` and `tool`
// checkouts, so today nothing would match; every setup-node says `package-manager-cache: false`
// anyway, so "no cache restore or save" (W5) does not rest on the folder layout.
export const SETUP_NODE_WITH = Object.freeze(['node-version', 'package-manager-cache']);

// The hold check's step form, from the tool checkout at this workflow's commit (a local action
// path resolves against the runner's workspace, where the tool was checked out as `tool`).
export const HOLD_ACTION = './tool/.github/actions/hold';

export const TOOL_GUARD = Object.freeze({
  name: 'Refuse a tool commit that is not 40 lowercase hex',
  env: { ROUTE_TOOL_SHA: '${{ job.workflow_sha }}' },
  run: '[[ "$ROUTE_TOOL_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "Refused: the tool commit (job.workflow_sha) is not 40 lowercase hex."; exit 1; }\n',
});

// The release job's last step: the title as ONE argument, "Latest" set on purpose from the plan's
// `latest` (yes: --latest; no: --latest=false; anything else: refused, nothing created).
export const RELEASE_CREATE = 'title="$(cat -- "$ROUTE_OUT/title.txt")"\n' +
  'case "$ROUTE_LATEST" in\n' +
  '  yes) latest=--latest ;;\n' +
  '  no) latest=--latest=false ;;\n' +
  '  *) echo "Refused: the plan\'s latest is not yes or no."; exit 1 ;;\n' +
  'esac\n' +
  'gh release create "v$ROUTE_VERSION" --verify-tag "$latest" --title "$title" --notes-file "$ROUTE_OUT/notes.md"\n';

export const isCheckout = (step) => typeof step.uses === 'string' && step.uses.startsWith('actions/checkout@');
export const isToolCheckout = (step) => isCheckout(step) && step.with?.repository === 'footprintjs/ci';
export const stepNamed = (job, name) => {
  const found = job.steps.filter((step) => step.name === name);
  if (found.length !== 1) throw new Error(`${found.length} steps named ${name}`);
  return found[0];
};

// Every value of a document, with where it sits: [path, value] for each scalar.
export function* leaves(value, path = []) {
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) yield* leaves(child, [...path, key]);
  } else yield [path, value];
}

// Which jobs run, and with which result, for one world:
//   { cancelled, plan: { result, outputs }, results: { job: result when it runs } }
// A job whose `if:` is true runs and ends with results[job] (default success); otherwise it is
// skipped. The plan job has no condition. Every other job's condition starts with !cancelled(),
// so the condition alone decides (no implied success(); release-route.test.mjs pins that).
export function simulate(jobs, world) {
  const state = {};
  for (const [id, job] of Object.entries(jobs)) {
    if (id === 'plan') { state.plan = world.plan; continue; }
    const needs = Object.fromEntries([job.needs].flat().map((need) => [need, state[need]]));
    const runs = evaluate(parseCondition(job.if), { cancelled: world.cancelled === true, needs });
    state[id] = runs ? { result: world.results?.[id] ?? 'success', outputs: {} } : { result: 'skipped', outputs: {} };
  }
  return state;
}
