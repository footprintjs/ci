// Does every plain `uses:` line naming the route pin the commit running, with no route mention
// written any other way and at least one pin read? (observe.mjs · observePins, pins.mjs)
import { observePins } from '../../observe.mjs';
import { writeObservation } from '../state.mjs';

export const PINS = Object.freeze({
  id: 'look-pins',
  name: 'Read the caller\'s pins',
  description: 'Does every `uses:` line that names the route pin the commit running?',
  make: ({ env, git }) => async (scope) => writeObservation(scope, await observePins({ env, git, commit: scope.commit })),
});
