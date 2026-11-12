// Is the release tool commit on footprintjs/ci main? One GitHub compare (observe.mjs · observeTool).
// The token stays in `env`, inside this closure: it never becomes a value in state.
import { observeTool } from '../../observe.mjs';
import { writeObservation } from '../state.mjs';

export const TOOL = Object.freeze({
  id: 'look-tool',
  name: 'Look at the tool commit',
  description: 'Is the release tool commit on footprintjs/ci main?',
  make: ({ env, fetcher }) => async (scope) => writeObservation(scope, await observeTool({ env, fetcher })),
});
