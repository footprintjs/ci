// Is .github/release.json at the commit readable and valid? (observe.mjs · observeSettings)
import { observeSettings } from '../../observe.mjs';
import { writeObservation } from '../state.mjs';

export const SETTINGS = Object.freeze({
  id: 'look-settings',
  name: 'Read the settings',
  description: 'Is .github/release.json at the commit readable and valid?',
  make: ({ git }) => async (scope) => writeObservation(scope, await observeSettings({ git, commit: scope.commit })),
});
