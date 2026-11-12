// Ask npm for the version's record (registry.mjs · waitForDist, the one bounded wait). The record
// keeps how many looks it took; a version npm never shows ends in registry-late, after the looks
// are written, so the record explains it.
import { waitForDist } from '../../registry.mjs';

export const ASK = Object.freeze({
  id: 'ask-npm',
  name: "Ask npm for the version's record",
  description: 'Wait a bounded time for npm to show the version; its integrity and tarball address',
  make: ({ fetcher, sleep, wait }) => async (scope) => {
    scope.looks = 0;
    const dist = await waitForDist({ fetcher, name: scope.packageName, version: scope.version, sleep, wait,
      onLook: (look) => { scope.looks = look; } });
    scope.npmIntegrity = dist.integrity;
    scope.tarballUrl = dist.tarball;
  },
});
