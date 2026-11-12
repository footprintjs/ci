'use strict';
const { inflateRawSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const { fail, archiveRefusalCode } = require('./refusal.cjs');
const { requireSourceManifest } = require('./manifest.cjs');
const { parseManifest } = require('./strict-json.cjs');
const { compileArchiveRule } = require('./allowed.cjs');
const hash = (bytes, algorithm, encoding = 'hex') => createHash(algorithm).update(bytes).digest(encoding);
function text(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail();
  }
}
function field(bytes) {
  const end = bytes.indexOf(0);
  if (end >= 0 && bytes.subarray(end).some((n) => n !== 0)) fail();
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) fail();
  return text(end < 0 ? bytes : bytes.subarray(0, end));
}
function octal(bytes, { empty = false, checksum = false } = {}) {
  if (empty && bytes.every((n) => n === 0)) return 0;
  const value = bytes.toString('latin1');
  const shape = checksum
    ? /^[0-7]{6}(?:\0 | \0)$/
    : bytes.length === 8
    ? /^(?:[0-7]{7}\0|[0-7]{6} \0)$/
    : /^(?:[0-7]{11}\0|[0-7]{10} \0)$/;
  if (!shape.test(value)) fail();
  const n = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(n)) fail();
  return n;
}
function headerSize(header) {
  const magic = Buffer.from([117, 115, 116, 97, 114, 0, 48, 48]);
  if (!header.subarray(257, 265).equals(magic)) fail();
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : header[i];
  if (sum !== octal(header.subarray(148, 156), { checksum: true })) fail();
  octal(header.subarray(100, 108));
  for (const [start, end] of [
    [108, 116],
    [116, 124],
    [329, 337],
    [337, 345],
  ])
    if (octal(header.subarray(start, end), { empty: true }) !== 0) fail();
  octal(header.subarray(136, 148));
  // npm uses prefix/PAX for long or non-ASCII paths; this closed profile refuses them explicitly.
  if ([120, 103, 76, 75].includes(header[156]) || header.subarray(345, 500).some((n) => n !== 0))
    fail('archive-profile');
  // Portable regular-file packs have no link, owner, prefix or extension bytes.
  if (
    header[156] !== 48 ||
    header.subarray(157, 257).some((n) => n !== 0) ||
    header.subarray(265, 329).some((n) => n !== 0) ||
    header.subarray(345, 512).some((n) => n !== 0)
  )
    fail();
  return octal(header.subarray(124, 136));
}
// Release route: a path segment some file system resolves to another file (see readTar).
const DEVICE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9]|conin\$|conout\$)$/i;
const foldedByAFileSystem = (segment) =>
  segment.endsWith('.') || segment.endsWith(' ') || segment.includes('~') || segment.includes(':') ||
  DEVICE.test(segment.split('.')[0].trimEnd());
// Release route: the gzip + closed tar walk, split out of inspectArchive unchanged so that the
// vendored npm (npm-tool.mjs) is unpacked by this same reader instead of a second one.
// `admit(name)` is asked of every member right after its path passed the profile; it throws to
// refuse. Returns the members with their bytes, in tar order.
function readTar(bytes, limits, admit) {
  const maxArchive = limits.maxArchiveBytes ?? 16 * 1024 * 1024;
  const maxExpanded = limits.maxExpandedBytes ?? 64 * 1024 * 1024;
  const maxFiles = limits.maxFiles ?? 10000;
  if (
    ![maxArchive, maxExpanded, maxFiles].every((n) => Number.isSafeInteger(n) && n > 0) ||
    !Buffer.isBuffer(bytes) ||
    bytes.length > maxArchive
  )
    fail();
  // One flags-zero gzip member only. Never publish bytes hidden after its trailer.
  if (bytes.length < 18 || bytes[0] !== 31 || bytes[1] !== 139 || bytes[2] !== 8 || bytes[3] !== 0) fail();
  const decoded = inflateRawSync(bytes.subarray(10), { maxOutputLength: maxExpanded, info: true }),
    tar = decoded.buffer,
    trailer = 10 + decoded.engine.bytesWritten;
  if (
    trailer + 8 !== bytes.length ||
    bytes.readUInt32LE(trailer) !== crc32(tar) ||
    bytes.readUInt32LE(trailer + 4) !== tar.length
  )
    fail();
  if (tar.length % 512 !== 0) fail();
  const names = new Set(),
    folds = new Set(),
    folders = new Set(),
    members = [];
  let at = 0,
    ended = false;
  while (at + 512 <= tar.length) {
    const header = tar.subarray(at, at + 512);
    at += 512;
    if (header.every((n) => n === 0)) {
      if (at + 512 > tar.length || !tar.subarray(at).every((n) => n === 0)) fail();
      ended = true;
      break;
    }
    const size = headerSize(header);
    const padded = Math.ceil(size / 512) * 512;
    if (at + padded > tar.length || tar.subarray(at + size, at + padded).some((n) => n !== 0)) fail();
    const data = tar.subarray(at, at + size);
    at += padded;
    const name = field(header.subarray(0, 100));
    if (Buffer.byteLength(name) >= 100 || /[^\x20-\x7e]/.test(name)) fail('archive-profile');
    if (
      !name.startsWith('package/') ||
      /[\\\x00-\x1f]/.test(name) ||
      name.split('/').some((p) => p === '..' || p === '.' || p === '') ||
      names.has(name)
    )
      fail();
    // Release route (B2 of the second read): no member may have a name that some file system
    // resolves to a DIFFERENT file than the one written. npm on macOS or Windows extracts
    // package/Package.json OVER package/package.json, so a twin could carry an install script past
    // the manifest comparison. Refused in the profile, whatever the setting says (the README's
    // "names no archive may hold" says why for each): two paths equal without letter case; a root
    // member other than the exact package/package.json equal to it without case; and in any
    // segment a trailing "." or space, a "~" (Windows short names: PACKAG~1.JSO), a ":" (a drive
    // or an alternate data stream: package.json:x), or a Windows device base name (CON, PRN, AUX,
    // NUL, COM0-9, LPT0-9, CONIN$, CONOUT$, any case, any extension); and one path that is a file
    // in one member and a folder in another (npm then keeps one and silently drops the other).
    // "\\" and anything outside printable ASCII were already refused above.
    const folded = name.toLowerCase();
    if (folds.has(folded) || folders.has(folded)) fail('archive-name', { text: name });
    const parents = folded.split('/').slice(1, -1).map((_, i, all) => `package/${all.slice(0, i + 1).join('/')}`);
    if (parents.some((parent) => folds.has(parent))) fail('archive-name', { text: name });
    for (const parent of parents) folders.add(parent);
    if (folded === 'package/package.json' && name !== 'package/package.json') fail('archive-name', { text: name });
    if (name.split('/').some(foldedByAFileSystem)) fail('archive-name', { text: name });
    folds.add(folded);
    admit(name);
    names.add(name);
    if (names.size > maxFiles) fail();
    members.push({ path: name, size, data });
  }
  if (!ended) fail();
  return members;
}
// Release route: `expected` is { version, sourceManifest, archive }. The package name is the
// source manifest's (the whole-manifest comparison below already demands it), and the allowed
// members come from the repository's `archive` setting (allowed.cjs) instead of a fixed list.
function inspectArchive(bytes, expected) {
  try {
    const allowed = compileArchiveRule(expected.archive);
    const members = readTar(bytes, expected, (name) => {
      // A file npm gives a meaning of its own is refused whatever the setting says (allowed.cjs).
      if (allowed.denied(name.slice('package/'.length))) fail('archive-denied', { text: name });
      if (!allowed.admits(name.slice('package/'.length))) fail('archive-path', { text: name });
    });
    const files = members.map((m) => ({ path: m.path, size: m.size, sha256: hash(m.data, 'sha256') }));
    const manifest = members.find((m) => m.path === 'package/package.json');
    if (!manifest || manifest.size > 1024 * 1024) fail();
    const missing = allowed.missing(files.map((f) => f.path.slice('package/'.length)));
    if (missing.length > 0) fail('archive-missing', { text: missing[0] });
    const identity = parseManifest(manifest.data);
    requireSourceManifest(identity, expected.sourceManifest);
    if (identity.version !== expected.version) fail('archive-version');
    // publishConfig can move the registry or the dist-tag at publish time; the route names it.
    if (Object.prototype.hasOwnProperty.call(identity, 'publishConfig')) fail('archive-publish-config');
    return {
      package: identity.name,
      version: identity.version,
      sha256: hash(bytes, 'sha256'),
      shasum: hash(bytes, 'sha1'),
      integrity: `sha512-${hash(bytes, 'sha512', 'base64')}`,
      bytes: bytes.length,
      files,
    };
  } catch (e) {
    if (archiveRefusalCode(e) !== undefined) throw e;
    fail();
  }
}
// Release route: readTar alone, for a payload the caller has already pinned by digest. Every
// refusal is still this module's.
function readArchiveMembers(bytes, limits = {}) {
  try {
    return readTar(bytes, limits, () => {});
  } catch (e) {
    if (archiveRefusalCode(e) !== undefined) throw e;
    fail();
  }
}
function crc32(bytes) {
  let n = 0xffffffff;
  for (const b of bytes) {
    n ^= b;
    for (let i = 0; i < 8; i++) n = n & 1 ? (n >>> 1) ^ 0xedb88320 : n >>> 1;
  }
  return (n ^ 0xffffffff) >>> 0;
}
module.exports = { inspectArchive, readArchiveMembers, archiveRefusalCode, parseManifest };
