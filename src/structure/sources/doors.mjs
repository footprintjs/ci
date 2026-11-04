import { posix } from 'node:path';
import { codePath, productionPath } from './paths.mjs';
import { packageSourcePath } from './package-paths.mjs';
import { effectiveSeals } from './seals.mjs';

function siblingSeals(paths, trackedPaths) {
  const seals = [];
  for (const facade of paths) {
    const parent = posix.dirname(facade);
    const stem = posix.basename(facade, posix.extname(facade)).toLowerCase();
    const directories = new Set(trackedPaths.filter(path => path.startsWith(`${parent}/`))
      .map(path => path.slice(parent.length + 1).split('/')).filter(parts => parts.length > 1).map(parts => parts[0]));
    for (const directory of directories) {
      if (directory.toLowerCase() === stem) seals.push({ facade, folder: `${parent}/${directory}/` });
    }
  }
  return seals;
}

function exportTargets(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(exportTargets);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).filter(([key]) => key !== 'types').flatMap(([, entry]) => exportTargets(entry));
}

function packageDoors(files) {
  const paths = [];
  const unverified = [];
  const file = files.get('package.json');
  if (!file) return { paths, unverified };
  const manifest = JSON.parse(file.text);
  for (const target of exportTargets(manifest.exports ?? manifest.main)) {
    if (!codePath(target)) continue;
    const found = packageSourcePath(target, files);
    if (found.path && productionPath(found.path)) paths.push(found.path);
    else unverified.push({ kind: 'package-door', path: 'package.json', target,
      reason: found.reason ?? 'Public target has no supported tracked source mapping.' });
  }
  return { paths, unverified };
}

export function discoverDoors(files, parsedFiles) {
  const sourcePaths = [...files.keys()].filter(productionPath).sort();
  const candidates = siblingSeals(sourcePaths, [...files.keys()].filter(path => path.startsWith('src/')));
  const seals = effectiveSeals(candidates, files, parsedFiles);
  const manifest = packageDoors(files);
  const indexes = sourcePaths.filter(path => /^index\.[cm]?[jt]sx?$/.test(posix.basename(path)));
  return { paths: new Set([...indexes, ...candidates.map(seal => seal.facade), ...manifest.paths]),
    seals, unverified: manifest.unverified };
}
