'use strict';
const { createHash } = require('node:crypto');
const refusals = new WeakMap();
const fieldNames = new Set([
  'name',
  'version',
  'type',
  'description',
  'license',
  'author',
  'repository',
  'bugs',
  'homepage',
  'engines',
  'sideEffects',
  'main',
  'module',
  'types',
  'files',
  'exports',
  'scripts',
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'optionalDependencies',
  'bundleDependencies',
  'bundledDependencies',
  'bin',
  'dist',
  'tag',
  'publishConfig',
  'keywords',
  'packageManager',
  'workspaces',
  'root',
]);
// Release route: a `{ text }` field names something the route itself bounded first (an
// archive member that passed the closed tar profile, or `entry-<n>`); it is printed only
// when it is plain printable ASCII without `:`, and hashed like an unknown key otherwise.
const PLAIN = /^[\x21-\x39\x3b-\x7e]{1,200}$/;
const label = (key) =>
  typeof key === 'object' && key !== null && typeof key.text === 'string' && PLAIN.test(key.text)
    ? key.text
    : fieldNames.has(key)
    ? key
    : 'key-' + createHash('sha256').update(typeof key === 'string' ? key : String(key?.text)).digest('hex').slice(0, 12);
const fail = (code = 'invalid-archive', key) => {
  const e = new Error(code);
  e.code = code;
  const field = key === undefined ? '' : ':' + label(key);
  refusals.set(e, code + field);
  throw e;
};
const archiveRefusalCode = (error) => refusals.get(error);
module.exports = { fail, archiveRefusalCode };
