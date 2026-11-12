// Compare: npm's recorded integrity and the bytes it serves, each against the built file's. The
// rules are data, in the order the plain step checks them (registry.mjs · compareWithNpm): a
// different recorded integrity first, then different served bytes, then "the same".
import { decide } from 'footprintjs';

export const COMPARE_RULES = Object.freeze([
  { when: { integrityEqual: { eq: false } }, then: 'differs-integrity', label: 'npm records another integrity' },
  { when: { servedEqual: { eq: false } }, then: 'differs-bytes', label: 'npm serves other bytes' },
  { when: { integrityEqual: { eq: true }, servedEqual: { eq: true } }, then: 'same', label: 'npm serves the built bytes' },
]);

export const WEIGH_BYTES = Object.freeze({
  id: 'weigh-bytes',
  name: 'Weigh the bytes',
  description: "Is npm's integrity, and are the bytes it serves, the built file's?",
  make: () => (scope) => {
    scope.integrityEqual = scope.npmIntegrity === scope.localIntegrity;
    scope.servedEqual = scope.servedIntegrity === scope.localIntegrity;
  },
});

export const COMPARE = Object.freeze({
  id: 'compare',
  name: 'Compare with the built file',
  description: 'The first rule that matches decides',
  make: () => (scope) => decide(scope, COMPARE_RULES, { branch: 'differs-unknown', label: 'no rule matched' }),
});

const outcome = (id, write) => Object.freeze({ id, name: id, description: `Write the outcome: ${id}`, make: () => write });
export const OUTCOMES = Object.freeze([
  outcome('same', (scope) => { scope.verified = true; }),
  outcome('differs-integrity', (scope) => { scope.refusal = 'registry-differs'; scope.differsBy = 'integrity'; }),
  outcome('differs-bytes', (scope) => { scope.refusal = 'registry-differs'; scope.differsBy = 'tarball bytes'; }),
  outcome('differs-unknown', (scope) => { scope.refusal = 'no-rule-matched'; }),
]);
