import { groupProfiles } from './profiles.mjs';
import { matchProfiles } from './match.mjs';
import { profileObservations } from './observations.mjs';
import { ruleTotals, totalRegressions } from './totals.mjs';
import { matchingCoverage } from './coverage.mjs';

export function compareFindings(headFindings, baseFindings) {
  const head = groupProfiles(headFindings);
  const base = groupProfiles(baseFindings);
  const matching = matchProfiles(head, base);
  const observations = profileObservations(matching);
  const totals = ruleTotals(head, base);
  observations.regressions.push(...totalRegressions({ totals, observations, head }));
  return { ...observations, totals, coverage: matchingCoverage({ matching, base }) };
}
