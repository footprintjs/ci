// Wiring only: the verify chart. Read the built file, ask npm for the version's record, download
// what it serves, weigh the bytes, compare. Each stage is its own file under verify/.
import { flowChart } from 'footprintjs';
import { ASK } from './verify/ask.mjs';
import { BUILT } from './verify/built.mjs';
import { COMPARE, OUTCOMES, WEIGH_BYTES } from './verify/compare.mjs';
import { DOWNLOAD } from './verify/download.mjs';

const add = (builder, stage, doors) => builder.addFunction(stage.name, stage.make(doors), stage.id, stage.description);

// doors: { name, version, bytes, fetcher, sleep, wait? }
export function verifyChartBuilder(doors) {
  let builder = flowChart(BUILT.name, BUILT.make(doors), BUILT.id, { description: BUILT.description });
  for (const stage of [ASK, DOWNLOAD, WEIGH_BYTES]) builder = add(builder, stage, doors);
  let list = builder.addDeciderFunction(COMPARE.name, COMPARE.make(doors), COMPARE.id, COMPARE.description);
  for (const outcome of OUTCOMES) list = list.addFunctionBranch(outcome.id, outcome.name, outcome.make(doors), outcome.description);
  return list.setDefault('differs-unknown').end();
}

export const buildVerifyChart = (doors) => verifyChartBuilder(doors).build();
