// Wiring only: the plan chart. Read the request; then, side by side, the tip of main, the tool
// commit, the settings and package.json; gather; then, side by side, the tag, npm and the
// changelog (they need the version and the name); gather; then the decision (decision.mjs).
// Every stage is its own file under stages/; the doors (git, fetch, env) are bound here and
// never enter state.
import { flowChart } from 'footprintjs';
import { addDecision } from './decision.mjs';
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
const GATHER_FIRST = gather('gather-first', FIRST_LOOKS);
const GATHER_SECOND = gather('gather-second', SECOND_LOOKS);

const children = (looks, doors) => looks.map((look) => ({ id: look.id, name: look.name, fn: look.make(doors), description: look.description }));
const add = (builder, stage, doors) => builder.addFunction(stage.name, stage.make(doors), stage.id, stage.description);

// doors: { env, git, fetcher }. failFast: an observer never throws for what it could not read
// (it records the cause); a throw is a fault, and it stops the run.
export function planChartBuilder(doors) {
  let builder = flowChart(REQUEST.name, REQUEST.make(doors), REQUEST.id, { description: REQUEST.description })
    .addListOfFunction(children(FIRST_LOOKS, doors), { failFast: true });
  builder = add(builder, GATHER_FIRST, doors).addListOfFunction(children(SECOND_LOOKS, doors), { failFast: true });
  return addDecision(add(builder, GATHER_SECOND, doors));
}

export const buildPlanChart = (doors) => planChartBuilder(doors).build();
