// Gather what the looks found. Stages that run side by side (a fork) write under runs/<id>/ in
// the library (its rule, so siblings cannot overwrite each other); this stage lifts their facts,
// causes and context to the top level, under the fact names of rules.mjs, so the decision reads
// them by name. The record keeps both: each look's own writes, and this lift.
import { CONTEXT_NAMES, FACT_NAMES } from '../state.mjs';

export const gather = (id, children) => Object.freeze({
  id,
  name: 'Gather what was seen',
  description: 'Lift the facts the looks found side by side to their names',
  make: () => (scope) => {
    const causes = { ...(scope.causes ?? {}) };
    for (const child of children) {
      const found = scope.$read(`runs.${child.id}`) ?? {};
      for (const name of FACT_NAMES) if (Object.hasOwn(found, name)) scope[name] = found[name];
      for (const key of CONTEXT_NAMES) if (Object.hasOwn(found, key)) scope[key] = found[key];
      Object.assign(causes, found.causes ?? {});
    }
    if (Object.keys(causes).length > 0) scope.causes = causes;
  },
});
