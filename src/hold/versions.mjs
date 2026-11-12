// The two versions a pull request is judged by, read from COMMITTED blobs in git:
// nothing is executed and no file of the candidate is opened by path (a symlink named
// package.json would be read as its own target text and fail the JSON check below).
// `git` is injected: (args) => stdout string, throwing when git fails.
const SHA = /^[a-f0-9]{40}$/;

function versionAt(git, revision, side) {
  let text;
  try { text = git(['cat-file', 'blob', `${revision}:package.json`]); } catch { throw new Error(`package.json cannot be read on the ${side} side`); }
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error(`package.json is not JSON on the ${side} side`); }
  const version = parsed !== null && typeof parsed === 'object' && Object.hasOwn(parsed, 'version') ? parsed.version : undefined;
  if (typeof version !== 'string' || version.length === 0) throw new Error(`package.json has no version string on the ${side} side`);
  return version;
}

export function readVersions(git, baseSha) {
  if (typeof baseSha !== 'string' || !SHA.test(baseSha) || /^0+$/.test(baseSha))
    throw new Error('the base commit is missing or not a full commit SHA (is this a pull request event?)');
  return { base: versionAt(git, baseSha, 'base'), head: versionAt(git, 'HEAD', 'head') };
}
