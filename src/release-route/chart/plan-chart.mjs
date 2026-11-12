// Wiring only: the plan chart. Read the request; then, side by side, the tip of main, the tool
// commit, the settings and package.json; gather; then, side by side, the tag, npm and the
// changelog (they need the version and the name); gather; then the decision (decision.mjs).
// Every stage is its own file under stages/; the doors (git, fetch, env) are bound here and
// never enter state. The stages are data (PLAN_STAGES), so a test can stand one in for another.
import { flowChart } from 'footprintjs';
import { addDecision, DECISION_STAGES } from './decision.mjs';
import { addStage, QUIET_LOGGER, stageFn } from './stage.mjs';
import { CHANGELOG } from './stages/changelog.mjs';
import { gather } from './stages/gather.mjs';
import { NPM } from './stages/npm.mjs';
import { PACKAGE } from './stages/package.mjs';
import { REQUEST } from './stages/request.mjs';
import { SETTINGS } from './stages/settings.mjs';
import { TAG } from './stages/tag.mjs';
import { TIP } from './stages/tip.mjs';
import { TOOL } from './stages/tool.mjs';

export const FIRST_LOOKS = Object.freeze([TIP, TOOL, SETTINGS, PACKAGE]);
export const SECOND_LOOKS = Object.freeze([TAG, NPM, CHANGELOG]);
export const PLAN_STAGES = Object.freeze({
  request: REQUEST,
  firstLooks: FIRST_LOOKS,
  gatherFirst: gather('gather-first', FIRST_LOOKS),
  secondLooks: SECOND_LOOKS,
  gatherSecond: gather('gather-second', SECOND_LOOKS),
  ...DECISION_STAGES,
});

const children = (looks, doors) => looks.map((look) => ({ id: look.id, name: look.name, fn: stageFn(look, doors), description: look.description }));

// doors: { env, git, fetcher }. failFast: an observer never throws for what it could not read
// (it records the cause); a throw is a fault, and it stops the run.
export function planChartBuilder(doors, stages = PLAN_STAGES) {
  const { request } = stages;
  let builder = flowChart(request.name, stageFn(request, doors), request.id, { description: request.description }).setLogger(QUIET_LOGGER)
    .addListOfFunction(children(stages.firstLooks, doors), { failFast: true });
  builder = addStage(builder, stages.gatherFirst, doors).addListOfFunction(children(stages.secondLooks, doors), { failFast: true });
  return addDecision(addStage(builder, stages.gatherSecond, doors), stages);
}

export const buildPlanChart = (doors, stages) => planChartBuilder(doors, stages).build();
