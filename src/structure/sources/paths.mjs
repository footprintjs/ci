import { posix } from 'node:path';

export function codePath(path) {
  return /\.(?:[cm]?[jt]s|[jt]sx)$/.test(path);
}

export function testPath(path) {
  return /(?:^|\/)(?:test|tests|__tests__)\//.test(path) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path);
}

export function measurementPath(path) {
  return path.startsWith('src/') && codePath(path) && !testPath(path);
}

export function productionPath(path) {
  return measurementPath(path) && !/\.d\.[cm]?ts$/.test(path);
}

function sourceCandidates(path) {
  if (/\.mjs$/.test(path)) return [path, path.replace(/\.mjs$/, '.mts')];
  if (/\.cjs$/.test(path)) return [path, path.replace(/\.cjs$/, '.cts')];
  if (/\.jsx?$/.test(path)) {
    const stem = path.replace(/\.jsx?$/, '');
    return [path, `${stem}.ts`, `${stem}.tsx`];
  }
  if (posix.extname(path)) return [path];
  return [path, ...['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']
    .flatMap(extension => [path + extension, `${path}/index${extension}`])];
}

export function resolveRelative(from, specifier, files) {
  const path = posix.normalize(posix.join(posix.dirname(from), specifier));
  if (path === '..' || path.startsWith('../') || posix.isAbsolute(path)) {
    return { reason: 'Module path escapes the tracked repository.' };
  }
  const found = [...new Set(sourceCandidates(path))].filter(candidate => files.has(candidate));
  if (found.length !== 1) return { reason: found.length ? 'Ambiguous tracked source module.' : 'Missing tracked source module.' };
  if (/\.d\.[cm]?ts$/.test(found[0])) return { reason: 'A declaration file is not a runtime source target.' };
  return { path: found[0], data: !codePath(found[0]) };
}

export function trackedFiles(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.files)) throw new TypeError('Snapshot requires tracked files.');
  const files = new Map();
  for (const file of snapshot.files) {
    if (!file || typeof file.path !== 'string' || typeof file.text !== 'string'
      || file.path === '' || posix.isAbsolute(file.path) || posix.normalize(file.path) !== file.path
      || file.path.startsWith('../') || files.has(file.path)) throw new TypeError('Invalid or duplicate tracked source path.');
    files.set(file.path, file);
  }
  return new Map([...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}
