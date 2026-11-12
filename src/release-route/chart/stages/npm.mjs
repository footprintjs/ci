// Does npm know the package, have the version, and is the version newer? (observe.mjs · observeNpm)
import { observeNpm } from '../../observe.mjs';
import { writeObservation } from '../state.mjs';

export const NPM = Object.freeze({
  id: 'look-npm',
  name: 'Ask npm',
  description: 'Does npm know the package, have the version, and is the version newer?',
  make: ({ fetcher }) => async (scope) => writeObservation(scope, await observeNpm({ fetcher, name: scope.packageName, version: scope.version })),
});
