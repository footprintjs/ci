// Wiring only: the decision part of the plan chart. Weigh the facts, decide by the rule table,
// one branch per row. Shared by the plan chart and the agreement test's chart (which seeds the
// facts directly), so both decide through exactly the same stages. The stages are data
// (DECISION_STAGES), so a test can stand one in for another and nothing else changes.
import { addStage, stageFn } from './stage.mjs';
import { DECIDE, NO_RULE } from './stages/decide.mjs';
import { RESULTS } from './stages/result.mjs';
import { WEIGH } from './stages/weigh.mjs';

export const DECISION_STAGES = Object.freeze({ weigh: WEIGH, decide: DECIDE, results: RESULTS });

export function addDecision(builder, stages = DECISION_STAGES) {
  const { weigh, decide, results } = stages;
  let list = addStage(builder, weigh).addDeciderFunction(decide.name, stageFn(decide), decide.id, decide.description);
  for (const result of results) list = list.addFunctionBranch(result.id, result.name, stageFn(result), result.description);
  return list.setDefault(NO_RULE).end();
}
