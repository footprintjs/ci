// Weigh the facts: is every fact readable? The ONE rule for that is plan.mjs · seenFacts (the pure
// oracle), so the chart and the plain step cannot disagree about what "readable" means. A fact
// never asked is written as null here, so the decision reads every name.
import { seenFacts } from '../../plan.mjs';
import { FACT_NAMES } from '../state.mjs';

export const WEIGH = Object.freeze({
  id: 'weigh',
  name: 'Weigh the facts',
  description: 'Every fact by name, and whether each was read',
  make: () => (scope) => {
    const facts = {};
    for (const name of FACT_NAMES) {
      const value = scope[name];
      facts[name] = value === undefined ? null : value;
      if (value === undefined) scope[name] = null;
    }
    scope.factsReadable = seenFacts(facts).factsReadable;
  },
});
