// Does origin have tag v<version>, does it name the planned commit, and has it a GitHub release?
// (observe.mjs · observeTag, then observeRelease, which asks only when the tag exists.)
import { merge, observeRelease, observeTag } from '../../observe.mjs';
import { writeObservation } from '../state.mjs';

export const TAG = Object.freeze({
  id: 'look-tag',
  name: 'Look for the tag and its release',
  description: 'Does origin have tag v<version>, at this commit, and has it a GitHub release?',
  make: ({ git, env, fetcher }) => async (scope) => {
    const tag = await observeTag({ git, version: scope.version, commit: scope.commit });
    const release = await observeRelease({ env, fetcher, version: scope.version, tagExists: tag.facts.tagExists });
    writeObservation(scope, merge(tag, release));
  },
});
