// The one command: `node scripts/release-route.mjs <step>`, steps plan | npm-tool | build |
// inspect | ready | verify | tag | notes. Inputs come from the environment the workflow sets with `env:` (never interpolated
// into a script line); each step prints a short summary, writes closed-alphabet outputs, and
// returns 0 or 1. Every exception ends as a named refusal and exit 1: no catch here passes.
//
//   plan     GITHUB_SHA, GITHUB_REF, ROUTE_ACTION, ROUTE_TOOL_SHA, [GITHUB_TOKEN]
//            -> mode, rule, compare, node, commit, [package, version] (exit 0 also for "nothing")
//   npm-tool ROUTE_NPM_DIR                                             (the pinned npm, unpacked)
//   build    ROUTE_COMMIT, ROUTE_OUT, [ROUTE_NPM_DIR]                  -> file
//   inspect  ROUTE_COMMIT, ROUTE_TARBALL_DIR                           (re-checks package.tgz)
//   ready    ROUTE_PACKAGE, ROUTE_VERSION, ROUTE_TARBALL_DIR           -> publish (yes|no)
//   verify   ROUTE_PACKAGE, ROUTE_VERSION, ROUTE_TARBALL_DIR           (npm serves these bytes)
//   tag      ROUTE_COMMIT, ROUTE_VERSION, GITHUB_REPOSITORY, [GITHUB_TOKEN] -> tag, release (create|skip)
//   notes    ROUTE_COMMIT, ROUTE_OUT                                   -> title-file, notes-file
// ROUTE_SOURCE (default ".") is the repository checkout every git question is asked in.
import archivePort from './archive/check-archive.cjs';
import { commitInput, input, pathInput, reportPlan, reportVerified, runHandlers, verifyInputs } from './step-common.mjs';
import { build } from './build.mjs';
import { unpackNpm } from './npm-tool.mjs';
import { ready } from './ready.mjs';
import { tagPlan } from './tag.mjs';
import { isCommit, isPackageName, isPlainVersion } from './identity.mjs';
import { releaseNotes, writeNotes } from './notes.mjs';
import { observe, readPackage } from './observe.mjs';
import { plan } from './plan.mjs';
import { compareWithNpm } from './registry.mjs';
import { readAtCommit } from './repo.mjs';
import { refuse } from './refusals.mjs';
import { MAX_SETTINGS_BYTES, readSettings, SETTINGS_PATH } from './settings.mjs';
import { clean as printable } from '../shared/text.mjs';

export const STEPS = Object.freeze(['plan', 'npm-tool', 'build', 'inspect', 'ready', 'verify', 'tag', 'notes']);

async function planStep({ env, git, fetcher, report }) {
  const { facts, causes, context } = await observe({ env, git, fetcher });
  reportPlan({ result: plan({ facts }), causes, context, report });
}

function buildStep({ env, git, run, report }) {
  const npmDir = env.ROUTE_NPM_DIR === undefined || env.ROUTE_NPM_DIR === '' ? undefined : pathInput(env, 'ROUTE_NPM_DIR');
  const result = build({ git, run, source: env.ROUTE_SOURCE || '.', commit: commitInput(env), out: pathInput(env, 'ROUTE_OUT'), env, npmDir });
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

async function verifyStep({ env, fetcher, sleep, wait, report }) {
  const { name, version, bytes } = verifyInputs(env);
  const result = await compareWithNpm({ fetcher, name, version, localBytes: bytes, sleep, wait });
  reportVerified({ name, version, integrity: result.integrity, report });
}

function npmToolStep({ env, report }) {
  const result = unpackNpm({ out: pathInput(env, 'ROUTE_NPM_DIR'), source: env.ROUTE_SOURCE || '.' });
  report.say(`Unpacked the pinned npm ${result.version} (${result.files} files, digests equal to vendor/npm/manifest.json).`);
}

async function readyStep({ env, fetcher, report }) {
  const name = input(env, 'ROUTE_PACKAGE', isPackageName);
  const version = input(env, 'ROUTE_VERSION', isPlainVersion);
  const { bytes } = archivePort.readIntake(pathInput(env, 'ROUTE_TARBALL_DIR'));
  const publish = await ready({ fetcher, name, version, localBytes: bytes });
  report.output('publish', publish);
  report.say(publish === 'yes' ? `Ready: npm does not have ${name}@${version}; publish it.`
    : `Ready: npm already serves ${name}@${version} with exactly these bytes; do not publish again, go on to verify.`);
}

async function tagStep({ env, git, fetcher, report }) {
  const version = input(env, 'ROUTE_VERSION', isPlainVersion);
  const result = await tagPlan({ git, fetcher, repo: env.GITHUB_REPOSITORY, version, commit: commitInput(env), token: env.GITHUB_TOKEN });
  report.output('tag', result.tag);
  report.output('release', result.release);
  report.say(`Tag v${version}: ${result.tag}. GitHub release: ${result.release}.`);
}

function notesStep({ env, git, report }) {
  const notes = releaseNotes({ git, commit: commitInput(env) });
  const files = writeNotes(pathInput(env, 'ROUTE_OUT'), notes);
  report.output('title-file', files.titleFile);
  report.output('notes-file', files.notesFile);
  report.say(`Release title: ${printable(notes.title, 160)}`);
  report.say(`Release notes: ${notes.lines.length} lines in notes.md.`);
}

const HANDLERS = Object.freeze({ plan: planStep, 'npm-tool': npmToolStep, build: buildStep, inspect: inspectStep, ready: readyStep, verify: verifyStep,
  tag: tagStep, notes: notesStep });

// doors: { env, git, fetcher, run, sleep, report }. Returns the exit code.
export const runStep = (step, doors) => runHandlers(HANDLERS, step, doors);
