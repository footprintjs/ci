// THE RULE: the decision reads exactly what the plain path decides on. Cleaning is for copies
// made to be shown, and a shown copy lives under a name no rule reads. So a fact enters state as
// the observer's own value when that value is one of the fact's values in rules.mjs · FACTS, and
// as null otherwise; it is never cleaned, cut or coerced into a value. (Every observer already
// returns a value of its fact or null, so on real inputs this passes the value through unchanged;
// test/release-route/chart/same-as-plain-plan.test.mjs compares both paths line for line.)
//
// What else enters state, and in what shape (the state is saved as the run's record and printed
// by the `why` reader, so only bounded, checked values go in):
// - a cause is { code, detail }: a refusal code from THE table and its detail as it is shown
//   (step-common.mjs · shownDetail, the one bound for printed and recorded details);
// - the context is the commit (40 hex), the package name, the plain version and the changelog
//   style, each checked against its own shape, or left out (the same shapes the plain step needs).
// The token never enters: it stays inside the doors the stages were built with.
import { isCommit, isPackageName, isPlainVersion } from '../identity.mjs';
import { Refusal } from '../refusals.mjs';
import { FACTS } from '../rules.mjs';
import { CHANGELOG_STYLES } from '../settings.mjs';
import { shownDetail } from '../step-common.mjs';

export const FACT_NAMES = Object.freeze(Object.keys(FACTS));

// A fact as state holds it: one of its values, exactly, or null.
export const factValue = (name, value) => (FACTS[name].includes(value) ? value : null);

export const causeValue = (refusal) => ({ code: refusal.code, detail: shownDetail(refusal.detail) });

export const causeRefusal = (cause) => new Refusal(cause.code, cause.detail);

const CONTEXT_CHECKS = Object.freeze({
  commit: isCommit,
  packageName: isPackageName,
  version: isPlainVersion,
  changelogStyle: (value) => CHANGELOG_STYLES.includes(value),
});

// The names of the context values a look reads (the keys above), as FACT_NAMES is the facts'.
export const CONTEXT_NAMES = Object.freeze(Object.keys(CONTEXT_CHECKS));

// Writes one observation ({ facts, causes, context } from observe.mjs) into the stage's scope.
export function writeObservation(scope, found) {
  for (const [name, value] of Object.entries(found.facts)) scope[name] = factValue(name, value);
  const causes = Object.fromEntries(Object.entries(found.causes).map(([name, refusal]) => [name, causeValue(refusal)]));
  if (Object.keys(causes).length > 0) scope.causes = causes;
  const context = { ...found.context, packageName: found.context.name };
  for (const [key, check] of Object.entries(CONTEXT_CHECKS)) if (check(context[key])) scope[key] = context[key];
}
