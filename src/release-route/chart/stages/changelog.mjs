// Has CHANGELOG.md a section for the version? (observe.mjs · observeChangelog)
import { observeChangelog } from '../../observe.mjs';
import { writeObservation } from '../state.mjs';

export const CHANGELOG = Object.freeze({
  id: 'look-changelog',
  name: 'Read the changelog',
  description: 'Has CHANGELOG.md a section for the version?',
  make: ({ git }) => async (scope) => writeObservation(scope, await observeChangelog({
    git, commit: scope.commit, changelogStyle: scope.changelogStyle, version: scope.version,
  })),
});
