// Read the request: the action, the ref, the tool commit and the commit every other stage reads
// at. A malformed GITHUB_SHA throws input-invalid here and the run stops (as the plain step does).
import { observeRequest } from '../../observe.mjs';
import { writeObservation } from '../state.mjs';

export const REQUEST = Object.freeze({
  id: 'request',
  name: 'Read the request',
  description: 'The action, the ref, the tool commit and the commit to plan for',
  make: ({ env }) => (scope) => writeObservation(scope, observeRequest(env)),
});
