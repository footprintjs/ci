// The one command: `node scripts/release-route.mjs <step>`, steps plan | build | inspect | verify
// | notes. Inputs come from the environment the workflow sets with `env:` (never interpolated
// into a script line); each step prints a short summary, writes closed-alphabet outputs, and
// returns 0 or 1. Every exception ends as a named refusal and exit 1: no catch here passes.
//
//   plan     GITHUB_SHA, GITHUB_REF, ROUTE_ACTION, ROUTE_TOOL_SHA, [GITHUB_TOKEN, GITHUB_API_URL]
//            -> mode, rule, compare, commit, [package, version]       (exit 0 also for "nothing")
//   build    ROUTE_COMMIT, ROUTE_OUT                                   -> file
//   inspect  ROUTE_COMMIT, ROUTE_TARBALL_DIR                           (re-checks package.tgz)
//   verify   ROUTE_PACKAGE, ROUTE_VERSION, ROUTE_TARBALL_DIR           (npm serves these bytes)
//   notes    ROUTE_COMMIT, ROUTE_OUT                                   -> title-file, notes-file
// ROUTE_SOURCE (default ".") is the repository checkout every git question is asked in.
import archivePort from './archive/check-archive.cjs';
import { build } from './build.mjs';
import { isCommit, isPackageName, isPlainVersion } from './identity.mjs';
import { releaseNotes, writeNotes } from './notes.mjs';
import { observe, readPackage } from './observe.mjs';
import { plan, unreadableFacts } from './plan.mjs';
import { compareWithNpm } from './registry.mjs';
import { readAtCommit } from './repo.mjs';
import { asRefusal, REFUSALS, refuse } from './refusals.mjs';
import { MAX_SETTINGS_BYTES, readSettings, SETTINGS_PATH } from './settings.mjs';
import { printable } from './text.mjs';

export const STEPS = Object.freeze(['plan', 'build', 'inspect', 'verify', 'notes']);

const input = (env, name, check) => {
  const value = env[name];
  if (typeof value !== 'string' || !check(value)) refuse('input-invalid', name);
  return value;
};
const commitInput = (env) => input(env, 'ROUTE_COMMIT', isCommit);
const pathInput = (env, name) => input(env, name, (value) => value.length > 0 && value.length <= 4096 && !value.includes('\0'));

async function planStep({ env, git, fetcher, report }) {
  const { facts, causes, context } = await observe({ env, git, fetcher });
  const result = plan({ facts });
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

function buildStep({ env, git, run, report }) {
  const result = build({ git, run, source: env.ROUTE_SOURCE || '.', commit: commitInput(env), out: pathInput(env, 'ROUTE_OUT'), env });
  report.output('file', result.file);
  report.say(`Built ${printable(result.name, 214)} ${result.version}: package.tgz, ${result.files} files, ${result.integrity}.`);
}

function inspectStep({ env, git, report }) {
  const commit = commitInput(env);
  const settingsBytes = readAtCommit(git, commit, SETTINGS_PATH, MAX_SETTINGS_BYTES, 'settings-unreadable');
  if (settingsBytes === null) refuse('settings-unreadable', SETTINGS_PATH);
  const settings = readSettings(settingsBytes);
  const { bytes, manifest } = readPackage(git, commit);
  if (!isPlainVersion(manifest.version)) refuse('version-not-plain');
  const checked = archivePort.checkArchive(pathInput(env, 'ROUTE_TARBALL_DIR'), bytes, manifest.version, settings.archive);
  report.say(`Inspected ${printable(checked.package, 214)} ${checked.version}: ${checked.files.length} files, all allowed, ${checked.integrity}.`);
}

async function verifyStep({ env, fetcher, sleep, report }) {
  const name = input(env, 'ROUTE_PACKAGE', isPackageName);
  const version = input(env, 'ROUTE_VERSION', isPlainVersion);
  const { bytes } = archivePort.readIntake(pathInput(env, 'ROUTE_TARBALL_DIR'));
  const result = await compareWithNpm({ fetcher, name, version, localBytes: bytes, sleep });
  report.say(`Verified: npm serves ${name}@${version} with the same bytes as the built file (${result.integrity}).`);
}

function notesStep({ env, git, report }) {
  const notes = releaseNotes({ git, commit: commitInput(env) });
  const files = writeNotes(pathInput(env, 'ROUTE_OUT'), notes);
  report.output('title-file', files.titleFile);
  report.output('notes-file', files.notesFile);
  report.say(`Release title: ${printable(notes.title, 160)}`);
  report.say(`Release notes: ${notes.lines.length} lines in notes.md.`);
}

const HANDLERS = Object.freeze({ plan: planStep, build: buildStep, inspect: inspectStep, verify: verifyStep, notes: notesStep });

// doors: { env, git, fetcher, run, sleep, report }. Returns the exit code.
export async function runStep(step, doors) {
  const { report } = doors;
  try {
    if (typeof step !== 'string' || !Object.hasOwn(HANDLERS, step)) refuse('unknown-step', step);
    await HANDLERS[step](doors);
    report.summary();
    return 0;
  } catch (error) {
    const refusal = asRefusal(error);
    try {
      report.say(`Refused: ${refusal.code}. ${REFUSALS[refusal.code]}`);
      if (refusal.detail) report.say(`Detail: ${printable(refusal.detail, 200)}`);
      report.summary();
    } catch {
      // Printing failed too; the exit code still says "refused".
    }
    return 1;
  }
}
