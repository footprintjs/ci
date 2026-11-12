// Is the planned commit the tip of origin main? Measured with git ls-remote (observe.mjs · observeTip).
import { observeTip } from '../../observe.mjs';
import { writeObservation } from '../state.mjs';

export const TIP = Object.freeze({
  id: 'look-tip',
  name: 'Look at the tip of main',
  description: 'Is the planned commit the tip of origin main?',
  make: ({ git }) => async (scope) => writeObservation(scope, await observeTip({ git, commit: scope.commit })),
});
