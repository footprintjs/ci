// Build the package: the ONLY module that starts the repository's own commands. The workflow runs
// it only in the job that holds no secret and no write right.
//
// In order: the checkout must be the planned commit with a clean tree; the settings and
// package.json are read from that commit; the Node major must be the one the settings name;
// then `systemPackages` (apt), `install`, every one of `checks`, and `npm pack --ignore-scripts`
// into a fresh private folder. The single .tgz it leaves becomes <out>/package.tgz, and the
// archive inspector checks it once here (the publish job checks it again with its own copy).
//
// Every command is an argv list started WITHOUT a shell (settings.mjs split it), through the
// injected `run(argv, { cwd, env })` -> exit status. That stops the settings TEXT from being
// read as shell; it does not limit what runs: the commands are the repository's own code and can
// do anything this job can. So the job is the boundary (no secret, no write right), and the
// environment handed to them is narrowed (commandEnv) so they cannot write this step's outputs,
// summary or the next steps' environment through the runner's file-command variables.
// That is not a wall either (code running as the runner user can find those files), which is
// why no later job reads anything from the build job except the artifact, inspected again.
import { spawnSync } from 'node:child_process';
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import archivePort from './archive/check-archive.cjs';
import { isPlainVersion } from './identity.mjs';
import { npmCli } from './npm-tool.mjs';
import { readPackage } from './observe.mjs';
import { readAtCommit, requireCleanCheckout } from './repo.mjs';
import { refuse } from './refusals.mjs';
import { MAX_SETTINGS_BYTES, readSettings, SETTINGS_PATH } from './settings.mjs';

export const COMMAND_TIMEOUT_MS = 60 * 60 * 1000;
// The runner's file-command variables (writing to them sets outputs, environment, PATH, state
// and the summary of THIS step), the route's own inputs, and anything named like a secret.
const FILE_COMMANDS = Object.freeze(['GITHUB_OUTPUT', 'GITHUB_ENV', 'GITHUB_PATH', 'GITHUB_STATE', 'GITHUB_STEP_SUMMARY']);
const SECRET_LIKE = /token|secret|password|passwd|key|auth|credential/i;

export function commandEnv(env) {
  const copy = {};
  for (const [name, value] of Object.entries(env)) {
    const upper = name.toUpperCase();
    if (FILE_COMMANDS.includes(upper) || upper.startsWith('ROUTE_') || SECRET_LIKE.test(name)) continue;
    copy[name] = value;
  }
  copy.NPM_CONFIG_UPDATE_NOTIFIER = 'false';
  return copy;
}

// The default runner: no shell, output straight to the job log, a fixed timeout.
export function spawnRunner(argv, { cwd, env }) {
  const result = spawnSync(argv[0], argv.slice(1), { cwd, env, stdio: 'inherit', shell: false, timeout: COMMAND_TIMEOUT_MS });
  return result.error || result.signal ? -1 : result.status;
}

// `out` must be an absolute path outside the checkout, and absent or an empty folder.
function prepareOut(out, source) {
  if (typeof out !== 'string' || !isAbsolute(out)) refuse('output-folder', 'not absolute');
  mkdirSync(out, { recursive: true, mode: 0o700 });
  const stat = lstatSync(out);
  if (!stat.isDirectory() || stat.isSymbolicLink() || readdirSync(out).length !== 0) refuse('output-folder', 'not an empty folder');
  const inside = relative(realpathSync(source), realpathSync(out));
  if (inside === '' || (!inside.startsWith(`..${sep}`) && inside !== '..' && !isAbsolute(inside))) refuse('output-folder', 'inside the checkout');
}

// npmDir: the folder `npm-tool` unpacked the vendored npm into. Given, the package is packed with
// that npm (`node <npmDir>/package/bin/npm-cli.js pack ...`), the one the publish job uses; not
// given, with the runner's `npm`.
export function build({ git, run = spawnRunner, source, commit, out, env = process.env, nodeVersion = process.versions.node, npmDir, nodePath = process.execPath }) {
  requireCleanCheckout(git, commit);
  const settingsBytes = readAtCommit(git, commit, SETTINGS_PATH, MAX_SETTINGS_BYTES, 'settings-unreadable');
  if (settingsBytes === null) refuse('settings-unreadable', SETTINGS_PATH);
  const settings = readSettings(settingsBytes);
  const { bytes: sourceBytes, manifest } = readPackage(git, commit);
  if (!isPlainVersion(manifest.version)) refuse('version-not-plain');
  if (nodeVersion.split('.')[0] !== settings.node) refuse('node-version', `running ${nodeVersion.split('.')[0]}, settings say ${settings.node}`);
  const packer = npmDir === undefined ? ['npm'] : [nodePath, npmCli(npmDir)];
  prepareOut(out, source);

  const childEnv = commandEnv(env);
  const step = (argv, code, detail) => {
    if (run(argv, { cwd: source, env: childEnv }) !== 0) refuse(code, detail);
  };
  if (settings.systemPackages.length > 0) {
    step(['sudo', 'apt-get', 'update'], 'system-packages-failed', 'apt-get update');
    step(['sudo', 'apt-get', 'install', '-y', '--no-install-recommends', ...settings.systemPackages], 'system-packages-failed', 'apt-get install');
  }
  step(settings.install, 'install-failed', settings.install.join(' '));
  settings.checks.forEach((argv, index) => step(argv, 'check-failed', `checks[${index}]: ${argv.join(' ')}`));

  const packDir = mkdtempSync(join(tmpdir(), 'release-route-pack-'));
  try {
    step([...packer, 'pack', '--ignore-scripts', '--pack-destination', packDir], 'pack-failed');
    const left = readdirSync(packDir);
    if (left.length !== 1 || !left[0].endsWith('.tgz')) refuse('pack-output', `${left.length} entries`);
    const packed = join(packDir, left[0]);
    const stat = lstatSync(packed);
    if (!stat.isFile() || stat.nlink !== 1) refuse('pack-output', 'not one regular file');
    copyFileSync(packed, join(out, 'package.tgz'));
  } finally {
    rmSync(packDir, { recursive: true, force: true });
  }
  const checked = archivePort.checkArchive(out, sourceBytes, manifest.version, settings.archive);
  return { name: manifest.name, version: manifest.version, file: 'package.tgz', integrity: checked.integrity, files: checked.files.length };
}
