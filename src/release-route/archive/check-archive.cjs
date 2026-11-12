'use strict';
// THE archive inspector port of the release route: every check of a built tarball (the build
// job's first check, the publish job's re-check) goes through `checkArchive`. It reads files,
// never runs them; `inspector.cjs` decides.
const fs = require('node:fs');
const path = require('node:path');
const { inspectArchive, parseManifest } = require('./inspector.cjs');
const { fail } = require('./refusal.cjs');

const MAX_ARCHIVE_BYTES = 16 * 1024 * 1024;

function regularBytes(file, maximum) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size < 1 || stat.size > maximum) fail('archive-file');
    return fs.readFileSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

// The source manifest is the package.json of the commit being released, as bytes (the route
// reads it from git at that commit). Its name is the package's name: nothing is written in here.
function sourceManifest(bytes) {
  const source = parseManifest(bytes);
  if (typeof source.name !== 'string' || typeof source.version !== 'string') fail('manifest-source', 'root');
  return source;
}

// intake: an absolute folder holding exactly `package.tgz`. version: the planned version, which
// the source manifest AND the packed manifest must both carry. archive: the `archive` setting.
function checkArchive(intake, sourceBytes, version, archive) {
  if (typeof intake !== 'string' || !path.isAbsolute(intake)) fail('archive-intake');
  let stat;
  try {
    stat = fs.lstatSync(intake);
  } catch {
    fail('archive-intake');
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('archive-intake');
  const entries = fs.readdirSync(intake);
  if (entries.length !== 1 || entries[0] !== 'package.tgz') fail('archive-intake');
  const file = path.join(intake, 'package.tgz');
  const source = sourceManifest(sourceBytes);
  if (source.version !== version) fail('archive-version');
  let bytes;
  try {
    bytes = regularBytes(file, MAX_ARCHIVE_BYTES);
  } catch (error) {
    if (error && error.code === 'archive-file') throw error;
    fail('archive-file');
  }
  return { file, ...inspectArchive(bytes, { version, sourceManifest: source, archive }) };
}

function preparePublishDirectory(directory, intake, source) {
  if (!path.isAbsolute(directory) || !path.isAbsolute(intake) || !path.isAbsolute(source)) fail('publish-directory');
  const resolved = [
    path.join(fs.realpathSync(path.dirname(directory)), path.basename(directory)),
    fs.realpathSync(intake),
    fs.realpathSync(source),
  ];
  const within = (a, b) => a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep);
  if (within(resolved[0], resolved[1]) || within(resolved[0], resolved[2])) fail('publish-directory');
  try {
    fs.mkdirSync(directory, { mode: 0o700 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.readdirSync(directory).length !== 0) fail('publish-directory');
}

module.exports = { sourceManifest, checkArchive, preparePublishDirectory, regularBytes, MAX_ARCHIVE_BYTES };
