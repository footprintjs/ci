// Shared by the agreement tests: one decision chart (seed the facts, then the plan chart's own
// decision part) whose seed reads the facts of the current case from a variable, so the chart is
// built once and run per case.
import { flowChart, FlowChartExecutor } from 'footprintjs';
import { addDecision } from '../../../src/release-route/chart/decision.mjs';
import { FACTS } from '../../../src/release-route/rules.mjs';

let current = {};
const chart = addDecision(flowChart('Seed the facts', (scope) => {
  for (const [name, value] of Object.entries(current)) if (value !== undefined) scope[name] = value;
}, 'seed')).build();

// The chart's answer for these facts, in the words plan.mjs uses.
export async function chartDecides(facts) {
  current = facts;
  const executor = new FlowChartExecutor(chart);
  await executor.run();
  const state = executor.getSnapshot().sharedState;
  return state.refusal ? `${state.rule} -> refuse ${state.refusal}` : `${state.rule} -> ${state.mode} (compare ${state.compare})`;
}

export const oracle = (result) => (result.refuse ? `${result.rule} -> refuse ${result.refuse}` : `${result.rule} -> ${result.mode} (compare ${result.compare})`);

// Every combination of fact values in their domains (the pure test's enumeration).
export function* combinations(names = Object.keys(FACTS), partial = {}) {
  if (names.length === 0) { yield { ...partial }; return; }
  const [first, ...rest] = names;
  for (const value of FACTS[first]) yield* combinations(rest, { ...partial, [first]: value });
}
