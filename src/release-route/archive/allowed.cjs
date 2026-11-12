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
const { fail } = require('./refusal.cjs');

const ALWAYS = Object.freeze(['package.json', 'README.md', 'LICENSE']);
const MAX_ENTRIES = 64;
const MAX_LENGTH = 200;
// One path segment: letters, digits and . _ @ + - only. `*` is checked separately.
const SEGMENT = /^[A-Za-z0-9._@+-]+$/;

function entryProblem(entry) {
  if (typeof entry !== 'string' || entry.length === 0 || entry.length > MAX_LENGTH) return true;
  const folder = entry.endsWith('/');
  const segments = (folder ? entry.slice(0, -1) : entry).split('/');
  const stars = entry.split('*').length - 1;
  if (stars > 1 || (stars === 1 && folder)) return true;
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
 * Validates the setting and returns { entries, admits(path), missing(paths) } over paths
 * WITHOUT the `package/` prefix. Refuses with `archive-setting` (field: the entry's
 * 1-based position) on any malformed, duplicate or always-allowed entry.
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
    admits: (path) => ALWAYS.includes(path) || rules.some((rule) => rule.admits(path)),
    // The required entries no path satisfies, in setting order.
    missing: (paths) => rules.filter((rule) => rule.required && !paths.some((path) => rule.admits(path))).map((rule) => rule.entry),
  });
}

module.exports = { compileArchiveRule, ALWAYS_ALLOWED: ALWAYS };
