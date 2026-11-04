function objectManifest(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Read metadata as data; nested fixtures may leave package ownership unknown. */
export function packageOwnership(files) {
  const text = files.get('package.json')?.text;
  const root = text ? JSON.parse(text) : {};
  if (!objectManifest(root)) throw new TypeError('Root package metadata must be an object.');
  const packages = new Set(['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
    .flatMap(key => Object.keys(root[key] ?? {})));
  const sourcePackages = new Set(typeof root.name === 'string' ? [root.name] : []);
  const unverified = [];
  for (const [path, file] of files) {
    if (path === 'package.json' || !/(?:^|\/)package\.json$/.test(path)) continue;
    try {
      const manifest = JSON.parse(file.text);
      if (!objectManifest(manifest)) throw new TypeError('Nested package metadata must be an object.');
      if (typeof manifest.name === 'string') sourcePackages.add(manifest.name);
    } catch {
      unverified.push({ kind: 'affected-package', path, line: 1,
        reason: 'Nested package metadata cannot establish its potential source package name.' });
    }
  }
  return { packages, sourcePackages, unknownSourcePackages: unverified.length > 0, unverified };
}
