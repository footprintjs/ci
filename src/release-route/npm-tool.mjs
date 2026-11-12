// The one npm the route packs and publishes with: vendor/npm/npm-11.19.0.tgz, pinned by its
// digest in vendor/npm/manifest.json. `unpackNpm` checks both digests, then unpacks it with the
// archive inspector's own tar reader (archive/inspector.cjs · readArchiveMembers: the same closed
// gzip/tar profile, no second parser and no `tar` process) into a folder the workflow names:
// absolute, new, private (0700) and outside the checkout. `npmCli` hands build and the publish
// job the CLI in that folder, after checking the folder holds the pinned name and version.
//
// Why one npm: a rebuild is compared byte for byte with what npm serves, and npm's pack output
// can differ between npm versions; packing and publishing with the same pinned npm keeps "the
// rebuild equals npm" a question about the source, not about the runner's npm.
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import archivePort from './archive/check-archive.cjs';
import inspector from './archive/inspector.cjs';
import strictJson from './archive/strict-json.cjs';
import { isPlainVersion } from './identity.mjs';
import { refuse } from './refusals.mjs';

export const VENDOR_DIR = fileURLToPath(new URL('../../vendor/npm/', import.meta.url));
const SHA256 = /^[a-f0-9]{64}$/;
const INTEGRITY = /^sha512-[A-Za-z0-9+/]{86}==$/;

// The pinned facts about the vendored npm, strictly read.
export function vendoredNpm(vendorDir = VENDOR_DIR) {
  let manifest;
  try {
    manifest = strictJson.parseStrictJson(archivePort.regularBytes(join(vendorDir, 'manifest.json'), 64 * 1024), { maxBytes: 64 * 1024 });
  } catch {
    refuse('npm-tool', 'vendor/npm/manifest.json unreadable');
  }
  if (manifest.name !== 'npm' || !isPlainVersion(manifest.version) || manifest.file !== `npm-${manifest.version}.tgz` ||
      typeof manifest.sha256 !== 'string' || !SHA256.test(manifest.sha256) || typeof manifest.integrity !== 'string' ||
      !INTEGRITY.test(manifest.integrity)) refuse('npm-tool', 'vendor/npm/manifest.json shape');
  return manifest;
}

// out must be absolute, must not exist yet, its parent must exist, and it must lie outside `source`.
function newPrivateFolder(out, source) {
  if (typeof out !== 'string' || !isAbsolute(out)) refuse('npm-tool', 'the npm folder is not absolute');
  let exists = true;
  try { lstatSync(out); } catch { exists = false; }
  if (exists) refuse('npm-tool', 'the npm folder exists');
  let parent;
  try { parent = realpathSync(dirname(out)); } catch { refuse('npm-tool', 'the npm folder has no parent'); }
  const inside = relative(realpathSync(source), join(parent, 'x'));
  if (!inside.startsWith(`..${sep}`) && !isAbsolute(inside)) refuse('npm-tool', 'the npm folder is inside the checkout');
  mkdirSync(out, { mode: 0o700 });
}

export function unpackNpm({ out, source, vendorDir = VENDOR_DIR }) {
  const manifest = vendoredNpm(vendorDir);
  const bytes = archivePort.regularBytes(join(vendorDir, manifest.file), archivePort.MAX_ARCHIVE_BYTES);
  if (createHash('sha256').update(bytes).digest('hex') !== manifest.sha256) refuse('npm-tool', 'sha256 differs from vendor/npm/manifest.json');
  if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== manifest.integrity) refuse('npm-tool', 'sha512 differs from vendor/npm/manifest.json');
  const members = inspector.readArchiveMembers(bytes);
  newPrivateFolder(out, source);
  for (const member of members) {
    // Paths passed the closed profile: package/..., no "." or "..", printable ASCII, regular files.
    const target = join(out, member.path);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    writeFileSync(target, member.data, { flag: 'wx', mode: 0o644 });
  }
  npmCli(out, vendorDir);
  return { version: manifest.version, files: members.length };
}

// The CLI to run with `node`, after checking the folder holds the pinned npm.
export function npmCli(dir, vendorDir = VENDOR_DIR) {
  const manifest = vendoredNpm(vendorDir);
  if (typeof dir !== 'string' || !isAbsolute(dir)) refuse('npm-tool', 'the npm folder is not absolute');
  let pkg;
  try {
    pkg = strictJson.parseManifest(archivePort.regularBytes(join(dir, 'package', 'package.json'), 1024 * 1024));
  } catch {
    refuse('npm-tool', 'the npm folder holds no readable package.json');
  }
  if (pkg.name !== 'npm' || pkg.version !== manifest.version) refuse('npm-tool', 'the npm folder holds another npm');
  const cli = join(dir, 'package', 'bin', 'npm-cli.js');
  try { archivePort.regularBytes(cli, 1024 * 1024); } catch { refuse('npm-tool', 'the npm folder holds no npm-cli.js'); }
  return cli;
}
