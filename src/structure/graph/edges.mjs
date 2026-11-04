import { productionPath, resolveRelative } from '../sources/paths.mjs';
import { runtimeImports } from './imports.mjs';
import { exportedKind } from './export-kinds.mjs';

function declaredPackages(files) {
  const text = files.get('package.json')?.text;
  if (!text) return new Set();
  const manifest = JSON.parse(text);
  return new Set(['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
    .flatMap(key => Object.keys(manifest[key] ?? {})));
}

function moduleTarget(path, specifier, files, packages) {
  if (specifier.startsWith('.')) return resolveRelative(path, specifier, files);
  if (specifier.startsWith('/') || specifier.startsWith('#') || specifier.startsWith('@/')) {
    return { reason: 'Unsupported absolute or project-alias module specifier.' };
  }
  const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
  if (!specifier.startsWith('node:') && !packages.has(name)) return {
    reason: 'Bare module is not a declared external dependency; a source alias cannot be excluded.' };
  return { external: true, id: `external:${specifier}` };
}

export function sourceEdges(files, parsedFiles) {
  const edges = new Map();
  const unverified = [];
  const packages = declaredPackages(files);
  for (const [path, parsed] of parsedFiles) {
    if (!productionPath(path)) continue;
    const observed = runtimeImports(parsed);
    unverified.push(...observed.unverified);
    for (const site of observed.imports) {
      const target = moduleTarget(path, site.specifier, files, packages);
      const targetId = target.path ?? target.id ?? `unresolved:${site.specifier}`;
      if (target.reason) unverified.push({ kind: 'module-resolution', path, line: site.line,
        specifier: site.specifier, reason: target.reason });
      const key = `${path}\0${targetId}`;
      const old = edges.get(key);
      const reexportUncertain = Boolean(site.reexportNames)
        && !site.reexportNames.some(name => exportedKind(parsedFiles.get(target.path), name) === 'value');
      if (reexportUncertain) unverified.push({ kind: 'module-elision', path, line: site.line,
        reason: 'Named reexport has no directly proven runtime value owner; type elision or forwarding is unresolved.' });
      const uncertain = Boolean(target.reason) || Boolean(site.uncertain) || reexportUncertain;
      edges.set(key, { from: path, to: target.path ?? null, targetId, specifier: site.specifier,
        eager: (site.eager && !reexportUncertain) || Boolean(old?.eager), external: Boolean(target.external),
        data: Boolean(target.data), unverified: uncertain && (old?.unverified ?? true), line: old?.line ?? site.line });
    }
  }
  return { edges: [...edges.values()], unverified };
}
