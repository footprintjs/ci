import { createPreparationWitnessReader } from './preparation-witness.mjs';
import { packageProfile } from './package-profile.mjs';
/** Original ordinary proposal law. Repeated refreshes use the separately bounded chain reader. */
export function createHistoricalPreparationReader(inputProfile) {
  const profile = packageProfile(inputProfile), read = createPreparationWitnessReader(profile);
  return input => {
    const result = read(input);
    const parent = profile.originalParentLaw === 'source-only' ? null : result.predecessor?.head;
    if (!result.valid || result.pendingParent !== parent)
      return Object.freeze({ valid: false, reason: 'historical-preparation-unavailable' });
    return result;
  };
}
