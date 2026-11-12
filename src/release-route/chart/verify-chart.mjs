// Wiring only: the verify chart. Read the built file, ask npm for the version's record, download
// what it serves, weigh the bytes, compare. Each stage is its own file under verify/; the stages
// are data (VERIFY_STAGES), so a test can stand one in for another.
import { flowChart } from 'footprintjs';
import { addStage, QUIET_LOGGER, stageFn } from './stage.mjs';
import { ASK } from './verify/ask.mjs';
import { BUILT } from './verify/built.mjs';
import { COMPARE, OUTCOMES, WEIGH_BYTES } from './verify/compare.mjs';
import { DOWNLOAD } from './verify/download.mjs';

export const VERIFY_STAGES = Object.freeze({ built: BUILT, ask: ASK, download: DOWNLOAD, weighBytes: WEIGH_BYTES, compare: COMPARE, outcomes: OUTCOMES });

// doors: { name, version, bytes, fetcher, sleep, wait? }
export function verifyChartBuilder(doors, stages = VERIFY_STAGES) {
  const { built, compare } = stages;
  let builder = flowChart(built.name, stageFn(built, doors), built.id, { description: built.description }).setLogger(QUIET_LOGGER);
  for (const stage of [stages.ask, stages.download, stages.weighBytes]) builder = addStage(builder, stage, doors);
  let list = builder.addDeciderFunction(compare.name, stageFn(compare, doors), compare.id, compare.description);
  for (const outcome of stages.outcomes) list = list.addFunctionBranch(outcome.id, outcome.name, stageFn(outcome, doors), outcome.description);
  return list.setDefault('differs-unknown').end();
}

export const buildVerifyChart = (doors, stages) => verifyChartBuilder(doors, stages).build();
