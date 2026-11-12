// The decision, pure: facts in, one result out. No I/O, no clock, no `if` that decides; the
// rows of rules.mjs decide, first match wins.
//
//   plan({ facts: { action: 'publish', tagExists: true, npmHasVersion: true, ... } })
//   -> { rule: 'released', mode: 'nothing', compare: 'no', seen: {...} }
//
// A result is either { mode, compare } or { refuse }, always with `rule` (the row id, printed as
// the reason) and `seen` (the facts as the table saw them, factsReadable included). When no row
// matches, the result is the `no-rule-matched` refusal: the table is meant to be total (a test
// enumerates every combination), and this default keeps a gap from becoming a pass.
import { FACTS, RULES } from './rules.mjs';

const inDomain = (name, value) => FACTS[name].includes(value);

// The facts the table sees: each named fact (null when absent), plus factsReadable.
export function seenFacts(facts) {
  const seen = {};
  for (const name of Object.keys(FACTS)) seen[name] = Object.hasOwn(facts ?? {}, name) ? facts[name] : null;
  seen.factsReadable = Object.keys(FACTS).every((name) => inDomain(name, seen[name]));
  return Object.freeze(seen);
}

export const unreadableFacts = (seen) => Object.keys(FACTS).filter((name) => !inDomain(name, seen[name]));

export const matches = (rule, seen) => Object.entries(rule.when).every(([name, value]) => seen[name] === value);

export function plan({ facts }, rules = RULES) {
  const seen = seenFacts(facts);
  const rule = rules.find((candidate) => matches(candidate, seen));
  if (!rule) return Object.freeze({ rule: 'no-rule-matched', refuse: 'no-rule-matched', seen });
  return Object.freeze(rule.refuse
    ? { rule: rule.id, refuse: rule.refuse, seen }
    : { rule: rule.id, mode: rule.mode, compare: rule.compare, seen });
}
