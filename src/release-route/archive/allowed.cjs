'use strict';
// The `archive` setting: what a package's tarball may hold. ONE owner of this rule; the
// settings reader validates entries with `compileArchiveRule` and the inspector admits
// members with the same compiled rule, so the two can never disagree.
//
// An entry is a path below `package/`:
//   "dist/"          a folder; it must hold at least one file (a build that forgot dist/ is refused)
//   "*.d.ts"         a wildcard: `*` stands for one or more characters other than `/`, in the
//                    LAST path segment only; optional (zero matches is fine)
//   "CHANGELOG.md"   one file; it must be present
// package.json, README.md and LICENSE are always allowed and never listed. Anything else in
// the tarball is refused.
//
// Example (storydeck): ["dist/", "plugin/", "site/public/deck-stage.js", "*.d.ts", "*.css", "CHANGELOG.md"]
//
// Why so plain: a full glob language (`**`, braces, classes) is a second parser to trust in
// front of the publish right. These three shapes cover every package in the family today.
//
// DENIED is what NO setting can allow. The inspector this was copied from admitted a closed
// list (package.json, README.md, LICENSE, AGENTS.md, dist/) and its README says why that list
// was closed: "sibling .npmrc, binding.gyp and server.js files refuse independently of
// manifest contents". Once the list became a setting, a setting such as ["dist/", "*"] could
// re-admit them (found by the second reader of the route's first pull request). These are the
// files and folders npm gives a meaning of its own, so a build that adds one changes what a
// consumer's install does while package.json still equals the source:
//   binding.gyp           (root) npm's default install script is `node-gyp rebuild` when it is
//                         there and package.json has no install script: code runs on every install
//   server.js             (root) npm's default start script is `node server.js` when it is there
//   npm-shrinkwrap.json   (root) npm installs the dependency tree it pins, not the declared ranges
//   .npmrc                (anywhere) npm configuration: registry, scripts, credentials
//   node_modules          (any folder) dependency code shipped inside the package, bypassing the
//                         declared dependencies
// npm-shrinkwrap.json is the one addition to the three the copied README names and the
// node_modules folder the reviewer named: the original refused it too (it was not on its list).
// Names compare without case, because a case-insensitive file system treats them as the same.
const { fail } = require('./refusal.cjs');

const ALWAYS = Object.freeze(['package.json', 'README.md', 'LICENSE']);
const DENIED_ROOT_FILES = Object.freeze(['binding.gyp', 'server.js', 'npm-shrinkwrap.json']);
const DENIED_ANY_FILES = Object.freeze(['.npmrc']);
const DENIED_ANY_FOLDERS = Object.freeze(['node_modules']);
const MAX_ENTRIES = 64;
const MAX_LENGTH = 200;
// One path segment: letters, digits and . _ @ + - only. `*` is checked separately.
const SEGMENT = /^[A-Za-z0-9._@+-]+$/;

// true when a member path (without `package/`) is one no setting may allow.
function denied(path) {
  const parts = path.toLowerCase().split('/');
  const name = parts[parts.length - 1];
  return (parts.length === 1 && DENIED_ROOT_FILES.includes(name)) || DENIED_ANY_FILES.includes(name) ||
    parts.slice(0, -1).some((part) => DENIED_ANY_FOLDERS.includes(part));
}

function entryProblem(entry) {
  if (typeof entry !== 'string' || entry.length === 0 || entry.length > MAX_LENGTH) return true;
  // A bare `*` admits every root file there is; list what the package ships instead.
  if (entry === '*') return true;
  const folder = entry.endsWith('/');
  const segments = (folder ? entry.slice(0, -1) : entry).split('/');
  const stars = entry.split('*').length - 1;
  if (stars > 1 || (stars === 1 && folder)) return true;
  // An entry that NAMES a denied file or folder is a mistake to say out loud, not to admit.
  const lower = segments.map((segment) => segment.toLowerCase());
  if (lower.some((segment) => DENIED_ANY_FOLDERS.includes(segment) || DENIED_ANY_FILES.includes(segment))) return true;
  if (!folder && lower.length === 1 && DENIED_ROOT_FILES.includes(lower[0])) return true;
  return segments.some((segment, index) => {
    if (segment === '' || segment === '.' || segment === '..') return true;
    const wild = segment.includes('*');
    if (wild && index !== segments.length - 1) return true;
    return !SEGMENT.test(wild ? segment.replace('*', 'x') : segment);
  });
}

function compile(entry) {
  if (entry.endsWith('/')) return { entry, required: true, admits: (path) => path.startsWith(entry) && path.length > entry.length };
  const star = entry.indexOf('*');
  if (star < 0) return { entry, required: true, admits: (path) => path === entry };
  const cut = entry.lastIndexOf('/') + 1;
  const dir = entry.slice(0, cut);
  const before = entry.slice(cut, star);
  const after = entry.slice(star + 1);
  return {
    entry,
    required: false,
    admits(path) {
      if (!path.startsWith(dir)) return false;
      const name = path.slice(dir.length);
      return !name.includes('/') && name.length > before.length + after.length &&
        name.startsWith(before) && name.endsWith(after);
    },
  };
}

/**
 * Validates the setting and returns { entries, denied(path), admits(path), missing(paths) }
 * over paths WITHOUT the `package/` prefix. `admits` is false for every denied path, whatever
 * the setting says. Refuses with `archive-setting` (field: the entry's 1-based position) on
 * any malformed, duplicate, always-allowed or denied-naming entry, and on a bare `*`.
 */
function compileArchiveRule(entries) {
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > MAX_ENTRIES) fail('archive-setting', { text: 'list' });
  const seen = new Set();
  const rules = entries.map((entry, index) => {
    if (entryProblem(entry) || seen.has(entry) || ALWAYS.includes(entry)) fail('archive-setting', { text: `entry-${index + 1}` });
    seen.add(entry);
    return compile(entry);
  });
  return Object.freeze({
    entries: Object.freeze([...entries]),
    denied,
    admits: (path) => !denied(path) && (ALWAYS.includes(path) || rules.some((rule) => rule.admits(path))),
    // The required entries no path satisfies, in setting order.
    missing: (paths) => rules.filter((rule) => rule.required && !paths.some((path) => rule.admits(path))).map((rule) => rule.entry),
  });
}

const DENIED = Object.freeze({ rootFiles: DENIED_ROOT_FILES, anyFiles: DENIED_ANY_FILES, anyFolders: DENIED_ANY_FOLDERS });
module.exports = { compileArchiveRule, ALWAYS_ALLOWED: ALWAYS, DENIED };
