// Does origin have tag v<version>? (observe.mjs · observeTag)
import { observeTag } from '../../observe.mjs';
import { writeObservation } from '../state.mjs';

export const TAG = Object.freeze({
  id: 'look-tag',
  name: 'Look for the tag',
  description: 'Does origin have tag v<version>?',
  make: ({ git }) => async (scope) => writeObservation(scope, await observeTag({ git, version: scope.version })),
});
