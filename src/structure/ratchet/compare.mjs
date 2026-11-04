import { groupProfiles } from './profiles.mjs';
import { matchProfiles } from './match.mjs';
import { profileObservations } from './observations.mjs';
import { ruleTotals, totalRegressions } from './totals.mjs';
import { matchingCoverage } from './coverage.mjs';
import { applyAllowances } from './allowances.mjs';

export function compareFindings(headFindings, baseFindings, policies) {
  const head = groupProfiles(headFindings);
  const base = groupProfiles(baseFindings);
  const matching = matchProfiles(head, base);
  const observations = profileObservations(matching);
  const allowed = applyAllowances(observations, ruleTotals(head, base), policies);
  const totals = allowed.totals;
  observations.regressions.push(...totalRegressions({ totals, observations, head }));
  const unverified = matchingCoverage({ matching, base }).unverified.filter(item => !allowed.credited.has(item.unitId));
  return { ...observations, totals, coverage: { complete: unverified.length === 0, unverified } };
}
