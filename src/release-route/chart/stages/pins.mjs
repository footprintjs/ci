// Does every workflow file of the caller pin the route at the commit running? (observe.mjs · observePins)
import { observePins } from '../../observe.mjs';
import { writeObservation } from '../state.mjs';

export const PINS = Object.freeze({
  id: 'look-pins',
  name: 'Read the caller\'s pins',
  description: 'Does every workflow file that calls the route pin the commit running?',
  make: ({ env, git }) => async (scope) => writeObservation(scope, await observePins({ env, git, commit: scope.commit })),
});
