// One branch per row of the rule table: it writes the row's result. A mode row writes `mode` and
// `compare`; a refusal row writes `refusal`. Every branch writes `rule`, the printed reason.
import { RULES } from '../../rules.mjs';
import { NO_RULE } from './decide.mjs';

const resultStage = (row) => Object.freeze({
  id: row.id,
  name: `Rule ${row.id}`,
  description: row.refuse ? `Refuse ${row.refuse}` : `Mode ${row.mode}, compare with npm: ${row.compare}`,
  make: () => (scope) => {
    scope.rule = row.id;
    if (row.refuse) scope.refusal = row.refuse;
    else {
      scope.mode = row.mode;
      scope.compare = row.compare;
    }
  },
});

export const RESULTS = Object.freeze([
  ...RULES.map(resultStage),
  resultStage({ id: NO_RULE, refuse: NO_RULE }),
]);
