// What may enter the chart's state, and in what shape. The state is saved as the run's record
// and printed by the `why` reader, so only bounded, checked values go in:
// - a fact is true, false or null (null: not read, or not asked; never a guess);
// - a cause is { code, detail }: a refusal code from THE table and its detail, cleaned and cut;
// - the context is the commit (40 hex), the package name, the plain version and the changelog
//   style, each checked against its own shape, or left out.
// The token never enters: it stays inside the doors the stages were built with.
import { isCommit, isPackageName, isPlainVersion } from '../identity.mjs';
import { Refusal } from '../refusals.mjs';
import { FACTS } from '../rules.mjs';
import { CHANGELOG_STYLES } from '../settings.mjs';
import { flatten } from '../../shared/text.mjs';

export const FACT_NAMES = Object.freeze(Object.keys(FACTS));

// A fact as state holds it. A value of another type (none of the observers make one) is null.
export const factValue = (value) => (value === true || value === false ? value : null);

// The action is the one fact that is text from outside (the workflow's input): cut and cleaned.
export const actionValue = (value) => (typeof value === 'string' ? flatten(value, 40) : null);

export const causeValue = (refusal) => ({ code: refusal.code, detail: flatten(refusal.detail, 120) });

export const causeRefusal = (cause) => new Refusal(cause.code, cause.detail);

const CONTEXT_CHECKS = Object.freeze({
  commit: isCommit,
  packageName: isPackageName,
  version: isPlainVersion,
  changelogStyle: (value) => CHANGELOG_STYLES.includes(value),
});

// Writes one observation ({ facts, causes, context } from observe.mjs) into the stage's scope.
export function writeObservation(scope, found) {
  for (const [name, value] of Object.entries(found.facts)) scope[name] = name === 'action' ? actionValue(value) : factValue(value);
  const causes = Object.fromEntries(Object.entries(found.causes).map(([name, refusal]) => [name, causeValue(refusal)]));
  if (Object.keys(causes).length > 0) scope.causes = causes;
  const context = { ...found.context, packageName: found.context.name };
  for (const [key, check] of Object.entries(CONTEXT_CHECKS)) if (check(context[key])) scope[key] = context[key];
}
