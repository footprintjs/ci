// What the plain command (command.mjs) and the charted bundle (chart/) share: the checked inputs,
// what a plan step prints and outputs from its decision, what verify prints, and how one step of a
// handler table runs. One owner, so the two paths cannot print or exit differently.
import archivePort from './archive/check-archive.cjs';
import { isCommit, isPackageName, isPlainVersion } from './identity.mjs';
import { unreadableFacts } from './plan.mjs';
import { asRefusal, Refusal, REFUSALS, refuse } from './refusals.mjs';
import { clean as printable } from '../shared/text.mjs';

export const input = (env, name, check) => {
  const value = env[name];
  if (typeof value !== 'string' || !check(value)) refuse('input-invalid', name);
  return value;
};
export const commitInput = (env) => input(env, 'ROUTE_COMMIT', isCommit);
export const pathInput = (env, name) => input(env, name, (value) => value.length > 0 && value.length <= 4096 && !value.includes('\0'));

// What a plan step prints and outputs, from its decision: the plain step and the charted step
// (chart/) both end here, so their outputs cannot drift apart. Throws the refusal when the
// decision is one.
export function reportPlan({ result, causes, context, report }) {
  report.say(`Release route plan for commit ${context.commit}${context.name ? ` of ${printable(context.name, 214)}` : ''}${context.version ? ` ${context.version}` : ''}.`);
  report.output('rule', result.rule);
  report.output('commit', context.commit);
  if (context.name) report.output('package', context.name);
  if (context.version) report.output('version', context.version);
  for (const name of unreadableFacts(result.seen)) {
    const cause = causes[name];
    report.say(`Unreadable fact ${name}: ${cause ? `${cause.code} (${cause.sentence})${cause.detail ? ` ${printable(cause.detail)}` : ''}` : 'not asked or not known'}.`);
  }
  report.say(`Facts seen: ${Object.entries(result.seen).map(([name, value]) => `${name}=${printable(String(value), 20)}`).join(', ')}.`);
  if (result.refuse) {
    const first = unreadableFacts(result.seen)[0];
    refuse(result.refuse, result.rule === 'facts-unreadable' ? first : `rule ${result.rule}`);
  }
  report.output('mode', result.mode);
  report.output('compare', result.compare);
  const what = { nothing: 'nothing to do: the version is tagged and on npm', publish: 'publish, then verify, tag and release',
    recover: 'npm has it but there is no tag: rebuild, compare with npm, then tag and release',
    'dry-run': result.compare === 'yes' ? 'dry run: rebuild and compare with what npm serves' : `dry run: would publish ${context.version}` }[result.mode];
  report.say(`Decision: rule ${result.rule} gives mode ${result.mode}, ${what}.`);
}

// The verify step's inputs, checked: shared with the charted verify (chart/).
export function verifyInputs(env) {
  const name = input(env, 'ROUTE_PACKAGE', isPackageName);
  const version = input(env, 'ROUTE_VERSION', isPlainVersion);
  const { bytes } = archivePort.readIntake(pathInput(env, 'ROUTE_TARBALL_DIR'));
  return { name, version, bytes };
}
export const reportVerified = ({ name, version, integrity, report }) =>
  report.say(`Verified: npm serves ${name}@${version} with the same bytes as the built file (${integrity}).`);

// One step from a handler table: 0 when it returns, 1 with its refusal printed when it throws.
// The plain command and the charted bundle (chart/cli.mjs) both run their steps through this.
// The one bound for a refusal's detail wherever it is shown or kept: printed by a step, kept in a
// cause, kept in the record. One line, no control, format or direction characters, `::` broken.
export const shownDetail = (detail) => printable(detail, 200);

// A thrown value as the refusal it is shown as: its code and its shown detail, nothing else.
export function shownRefusal(error) {
  const refusal = asRefusal(error);
  return new Refusal(refusal.code, shownDetail(refusal.detail));
}

// The doors a handler receives are the given object's OWN properties, copied onto an object with
// no prototype: a handler destructures them (`{ env, git, fetcher, report }`), and destructuring
// reads the prototype chain, so a name set on Object.prototype (`wait`, `fetcher`) would otherwise
// become a door. Example: with Object.prototype.wait = { tries: 0 }, verify still waits the route's
// own bounded time, because the handler's `wait` is undefined and the default applies.
const ownDoors = (doors) => Object.assign(Object.create(null), doors);

export async function runHandlers(handlers, step, given) {
  const doors = ownDoors(given);
  const { report } = doors;
  try {
    if (typeof step !== 'string' || !Object.hasOwn(handlers, step)) refuse('unknown-step', step);
    await handlers[step](doors);
    report.end(0);
    return 0;
  } catch (error) {
    return printRefusal(report, error);
  }
}

// Prints a refusal (its code, its sentence, its cleaned detail) and the summary; returns 1. Also
// used by the bundle's plain loader (scripts/release-route-chart.mjs) for a bundle that will not load.
export function printRefusal(report, error) {
  const refusal = asRefusal(error);
  try {
    report.say(`Refused: ${refusal.code}. ${REFUSALS[refusal.code]}`);
    if (refusal.detail) report.say(`Detail: ${shownDetail(refusal.detail)}`);
    report.end(1);
  } catch {
    // Printing failed too; the exit code still says "refused".
  }
  return 1;
}
