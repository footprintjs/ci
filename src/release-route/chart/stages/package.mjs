// The package name, the private flag and the version at the commit. (observe.mjs · observePackage)
import { observePackage } from '../../observe.mjs';
import { writeObservation } from '../state.mjs';

export const PACKAGE = Object.freeze({
  id: 'look-package',
  name: 'Read package.json',
  description: 'The package name, private flag and version at the commit',
  make: ({ git }) => async (scope) => writeObservation(scope, await observePackage({ git, commit: scope.commit })),
});
