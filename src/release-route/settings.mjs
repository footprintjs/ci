// Read and validate a repository's `.github/release.json`: the few things that really differ
// between the packages of the family. Everything else (the package name, the tag format, the
// release title, the npm version, the runner, every timeout) is deliberately NOT a setting.
//
// {
//   "schema": 1,
//   "node": "22",
//   "systemPackages": ["ffmpeg"],
//   "install": "npm ci",
//   "checks": ["npm run test:cov", "npm run build", "npm run check:dist", "npx publint"],
//   "archive": ["dist/", "plugin/", "site/public/deck-stage.js", "*.d.ts", "*.css", "CHANGELOG.md"],
//   "changelog": "titled"
// }
//
// Every key is required, an unknown key is refused (so a typo is not silently ignored, and a
// later key such as `proposer` is refused until the route knows it), and every value has an
// exact type and a bound.
//
// Commands (`install`, each of `checks`) are run WITHOUT a shell: the text is split on single
// spaces into a program and its arguments. The program is npm, npx or node; the arguments use
// a closed alphabet, so `&&`, `|`, `$(...)`, quotes and redirects are refused rather than
// passed to npm as odd arguments. Anything more needs an npm script in package.json.
import allowed from './archive/allowed.cjs';
import strictJson from './archive/strict-json.cjs';
import { isNodeMajor } from './identity.mjs';
import { refuse } from './refusals.mjs';

export const SETTINGS_PATH = '.github/release.json';
export const MAX_SETTINGS_BYTES = 64 * 1024;
const KEYS = Object.freeze(['schema', 'node', 'systemPackages', 'install', 'checks', 'archive', 'changelog']);
export const CHANGELOG_STYLES = Object.freeze(['titled', 'keepachangelog']);
const PROGRAMS = Object.freeze(['npm', 'npx', 'node']);
const ARGUMENT = /^[A-Za-z0-9@%+=:,./_^~-]{1,100}$/;
// A Debian package name: lowercase letters, digits, + - . ; starts with a letter or digit. It may
// not END with "-" or ".": apt-get reads "name-" as "remove name".
const SYSTEM_PACKAGE = /^[a-z0-9][a-z0-9+.-]{0,61}[a-z0-9+]$/;
const MAX_CHECKS = 20;
const MAX_SYSTEM_PACKAGES = 10;

// "npm run test:cov" -> ['npm', 'run', 'test:cov']; refuses with the setting's name as detail.
export function commandArgv(text, name) {
  if (typeof text !== 'string' || text.length === 0 || text.length > 200) refuse('settings-invalid', name);
  const argv = text.split(' ');
  if (argv.length > 32 || !PROGRAMS.includes(argv[0]) || !argv.slice(1).every((arg) => ARGUMENT.test(arg)))
    refuse('settings-invalid', name);
  return Object.freeze(argv);
}

function parse(bytes) {
  try {
    return strictJson.parseStrictJson(bytes, { maxBytes: MAX_SETTINGS_BYTES, maxValues: 2000 });
  } catch {
    refuse('settings-json');
  }
}

// bytes: the file's content (a Buffer, read by the caller from git at the planned commit).
export function readSettings(bytes) {
  const value = parse(bytes);
  for (const key of Object.keys(value)) if (!KEYS.includes(key)) refuse('settings-unknown-key', key);
  for (const key of KEYS) if (!Object.hasOwn(value, key)) refuse('settings-missing-key', key);
  if (value.schema !== 1) refuse('settings-invalid', 'schema');
  if (!isNodeMajor(value.node)) refuse('settings-invalid', 'node');
  const system = value.systemPackages;
  if (!Array.isArray(system) || system.length > MAX_SYSTEM_PACKAGES || new Set(system).size !== system.length ||
      !system.every((name) => typeof name === 'string' && SYSTEM_PACKAGE.test(name))) refuse('settings-invalid', 'systemPackages');
  const install = commandArgv(value.install, 'install');
  if (!Array.isArray(value.checks) || value.checks.length === 0 || value.checks.length > MAX_CHECKS) refuse('settings-invalid', 'checks');
  const checks = value.checks.map((text, index) => commandArgv(text, `checks[${index}]`));
  allowed.compileArchiveRule(value.archive);
  if (!CHANGELOG_STYLES.includes(value.changelog)) refuse('settings-invalid', 'changelog');
  return Object.freeze({
    schema: 1,
    node: value.node,
    systemPackages: Object.freeze([...system]),
    install,
    checks: Object.freeze(checks),
    archive: Object.freeze([...value.archive]),
    changelog: value.changelog,
  });
}
