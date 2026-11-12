// Wiring only: the decision part of the plan chart. Weigh the facts, decide by the rule table,
// one branch per row. Shared by the plan chart and the agreement test's chart (which seeds the
// facts directly), so both decide through exactly the same stages.
import { DECIDE, NO_RULE } from './stages/decide.mjs';
import { RESULTS } from './stages/result.mjs';
import { WEIGH } from './stages/weigh.mjs';

export function addDecision(builder) {
  let list = builder
    .addFunction(WEIGH.name, WEIGH.make(), WEIGH.id, WEIGH.description)
    .addDeciderFunction(DECIDE.name, DECIDE.make(), DECIDE.id, DECIDE.description);
  for (const result of RESULTS) list = list.addFunctionBranch(result.id, result.name, result.make(), result.description);
  return list.setDefault(NO_RULE).end();
}
