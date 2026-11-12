// Build the package: the ONLY module that starts the repository's own commands. The workflow runs
// it only in the job that holds no secret and no write right.
//
// In order: the checkout must be the planned commit with a clean tree; the settings and
// package.json are read from that commit; the Node major must be the one the settings name;
// then `systemPackages` (apt), `install`, every one of `checks`, and `npm pack --ignore-scripts`
// into a fresh private folder. The single .tgz it leaves becomes <out>/package.tgz, and the
// archive inspector checks it once here (the publish job checks it again with its own copy).
//
// Every command is an argv list run WITHOUT a shell (settings.mjs split it), through the
// injected `run(argv, { cwd, env })` -> exit status. The environment handed to the repository's
// commands has the token variables removed, in case a workflow ever sets one in this job.
import { spawnSync } from 'node:child_process';
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import archivePort from './archive/check-archive.cjs';
import { isPlainVersion } from './identity.mjs';
import { readPackage } from './observe.mjs';
import { readAtCommit, requireCleanCheckout } from './repo.mjs';
import { refuse } from './refusals.mjs';
import { MAX_SETTINGS_BYTES, readSettings, SETTINGS_PATH } from './settings.mjs';

export const COMMAND_TIMEOUT_MS = 60 * 60 * 1000;
const SECRET_NAMES = ['GITHUB_TOKEN', 'GH_TOKEN', 'NODE_AUTH_TOKEN', 'NPM_TOKEN', 'NPM_CONFIG__AUTH', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
  'ACTIONS_ID_TOKEN_REQUEST_URL', 'ACTIONS_RUNTIME_TOKEN'];

export function commandEnv(env) {
  const copy = { ...env };
  for (const name of Object.keys(copy)) if (SECRET_NAMES.includes(name.toUpperCase())) delete copy[name];
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

export function build({ git, run = spawnRunner, source, commit, out, env = process.env, nodeVersion = process.versions.node }) {
  requireCleanCheckout(git, commit);
  const settingsBytes = readAtCommit(git, commit, SETTINGS_PATH, MAX_SETTINGS_BYTES, 'settings-unreadable');
  if (settingsBytes === null) refuse('settings-unreadable', SETTINGS_PATH);
  const settings = readSettings(settingsBytes);
  const { bytes: sourceBytes, manifest } = readPackage(git, commit);
  if (!isPlainVersion(manifest.version)) refuse('version-not-plain');
  if (nodeVersion.split('.')[0] !== settings.node) refuse('node-version', `running ${nodeVersion.split('.')[0]}, settings say ${settings.node}`);
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
    step(['npm', 'pack', '--ignore-scripts', '--pack-destination', packDir], 'pack-failed');
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
