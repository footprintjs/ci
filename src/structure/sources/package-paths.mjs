import { productionPath } from './paths.mjs';

function sourceSpellings(path) {
  if (/\.mjs$/.test(path)) return [path, path.replace(/\.mjs$/, '.mts')];
  if (/\.cjs$/.test(path)) return [path, path.replace(/\.cjs$/, '.cts')];
  if (/\.jsx?$/.test(path)) {
    const stem = path.replace(/\.jsx?$/, '');
    return [path, `${stem}.ts`, `${stem}.tsx`];
  }
  return [path];
}

function sourceMappings(target) {
  const path = target.replace(/^\.\//, '');
  if (path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..')) return [];
  const paths = [path.replace(/^dist\//, 'src/')];
  if (/^dist\/(?:esm|cjs)\//.test(path)) paths.push(path.replace(/^dist\/(?:esm|cjs)\//, 'src/'));
  return paths;
}

/** Finite filename mappings only; bundled entry routing and build configs stay unknown. */
export function packageSourcePath(target, files) {
  const candidates = [...new Set(sourceMappings(target).flatMap(sourceSpellings))]
    .filter(path => productionPath(path) && files.has(path));
  if (candidates.length === 1) return { path: candidates[0] };
  return { reason: candidates.length ? 'Ambiguous tracked public source mapping.'
    : 'Public target has no supported tracked source mapping.' };
}
