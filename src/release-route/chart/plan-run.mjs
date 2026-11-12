// The charted plan: build the chart with the doors, run it, and read back what the plain step
// reads from `observe` + `plan`: { facts, causes, context, result }, plus the run itself (for the
// record). A run that threw (input-invalid, or a fault) is returned as `failure`; the caller turns
// it into its refusal, exactly as the plain step does.
import { seenFacts } from '../plan.mjs';
import { execute } from './execute.mjs';
import { buildPlanChart } from './plan-chart.mjs';
import { causeRefusal, FACT_NAMES } from './state.mjs';

const fromState = (state) => {
  const facts = Object.fromEntries(FACT_NAMES.filter((name) => Object.hasOwn(state, name)).map((name) => [name, state[name]]));
  const causes = Object.fromEntries(Object.entries(state.causes ?? {}).map(([name, cause]) => [name, causeRefusal(cause)]));
  const context = {};
  if (state.commit) context.commit = state.commit;
  if (state.packageName) context.name = state.packageName;
  if (state.version) context.version = state.version;
  return { facts, causes, context };
};

// The decision the chart took, in the shape plan.mjs returns (seen comes from the same oracle).
export function chartResult(state) {
  const seen = seenFacts(fromState(state).facts);
  return state.refusal ? { rule: state.rule, refuse: state.refusal, seen } : { rule: state.rule, mode: state.mode, compare: state.compare, seen };
}

// doors: { env, git, fetcher, stages? } (stages: plan-chart.mjs · PLAN_STAGES unless a test stands one in).
export async function runPlanChart({ stages, ...doors }) {
  const chart = buildPlanChart(doors, stages);
  const run = await execute(chart);
  const state = run.snapshot.sharedState;
  return { chart, run, ...fromState(state), result: run.failure ? null : chartResult(state) };
}
