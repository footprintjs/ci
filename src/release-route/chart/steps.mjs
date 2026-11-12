// The charted steps the bundle runs: plan and verify (the same inputs, outputs and exit codes as
// the plain steps of command.mjs, which stay as the oracle), and why (the record reader).
//
// After a charted step decides, it prints the story of the decision in the library's own words,
// then saves its record. A record that cannot be saved never changes the decision: the decision is
// printed first; a PASS whose record could not be saved ends in record-unwritten (exit 1), because
// a release with no record is not what this route promises; a REFUSAL stays that refusal, with a
// line saying the record was not saved.
import { reportPlan, reportVerified, verifyInputs } from '../step-common.mjs';
import { asRefusal, refuse } from '../refusals.mjs';
import { execute } from './execute.mjs';
import { runPlanChart } from './plan-run.mjs';
import { routeRecord, saveRecord } from './record.mjs';
import { buildVerifyChart } from './verify-chart.mjs';
import { explain, readRouteRecord } from './why.mjs';

// The story: decide()'s own sentence for the decision, as the narrative wrote it.
function tellStory(run, report) {
  for (const entry of run.narrative) if (entry.type === 'condition') report.say(`Story: ${entry.text}`);
}

// Runs `decide()` (which prints and may throw the decision's refusal), then saves the record.
function finish({ env, step, chart, run, report }, decide) {
  let decision = null;
  try {
    if (run.failure) throw run.failure.error;
    tellStory(run, report);
    decide();
  } catch (error) {
    decision = asRefusal(error);
  }
  let saved;
  try {
    saved = saveRecord(env, step, routeRecord({ step, chart, run }));
    if (saved) report.say(`Record: ${saved} saved in ROUTE_RECORD_DIR.`);
  } catch (error) {
    if (!decision) throw error;
    report.say(`Record: not saved (${asRefusal(error).code}); the decision below stands.`);
  }
  if (decision) throw decision;
}

export async function chartPlanStep({ env, git, fetcher, report }) {
  const planned = await runPlanChart({ env, git, fetcher });
  finish({ env, step: 'plan', chart: planned.chart, run: planned.run, report }, () =>
    reportPlan({ result: planned.result, causes: planned.causes, context: planned.context, report }));
}

export async function chartVerifyStep({ env, fetcher, sleep, report, wait }) {
  const { name, version, bytes } = verifyInputs(env);
  const chart = buildVerifyChart({ name, version, bytes, fetcher, sleep, wait });
  const run = await execute(chart);
  const state = run.snapshot.sharedState;
  finish({ env, step: 'verify', chart, run, report }, () => {
    if (state.refusal) refuse(state.refusal, state.differsBy);
    if (state.verified !== true) refuse('no-rule-matched');
    reportVerified({ name, version, integrity: state.localIntegrity, report });
  });
}

// why <record file> [key]: prints the answer; the file is the only input, no network.
export function whyStep({ argv, report }) {
  const [file, key] = argv;
  if (typeof file !== 'string' || file.length === 0 || file.length > 4096 || argv.length > 2) refuse('input-invalid', 'why <record file> [key]');
  for (const line of explain(readRouteRecord(file), key)) report.say(line);
}

export const CHART_STEPS = Object.freeze({ plan: chartPlanStep, verify: chartVerifyStep, why: whyStep });
