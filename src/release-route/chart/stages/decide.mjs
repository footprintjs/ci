// The decision: the rule table of rules.mjs handed to decide(), unchanged. Each row becomes one
// rule whose filter is the row's equality tests ({ fact: { eq: value } }) and whose label is the
// row's id; decide() takes the FIRST rule that matches, as plan.mjs does, and records the facts it
// weighed as evidence. Each row has its own branch (the row's id); no row matching is the default
// branch, `no-rule-matched`. rules.mjs stays the one owner of the table: nothing here edits a row.
import { decide } from 'footprintjs';
import { RULES } from '../../rules.mjs';

export const NO_RULE = 'no-rule-matched';

export const RULE_FILTERS = Object.freeze(RULES.map((row) => Object.freeze({
  when: Object.freeze(Object.fromEntries(Object.entries(row.when).map(([fact, value]) => [fact, Object.freeze({ eq: value })]))),
  then: row.id,
  label: row.id,
})));

export const DECIDE = Object.freeze({
  id: 'decide',
  name: 'Decide by the rule table',
  description: 'The first row of rules.mjs whose facts all match decides',
  make: () => (scope) => decide(scope, RULE_FILTERS, { branch: NO_RULE, label: 'no rule matched' }),
});
