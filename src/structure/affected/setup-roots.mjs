import { codePath, resolveRelative } from '../sources/paths.mjs';

export function setupRoots(runner, files) {
  const paths = [];
  for (const specifier of runner.setups ?? []) {
    if (!specifier || specifier.startsWith('/') || specifier.includes('://') || /^[A-Za-z]:/.test(specifier)) {
      return { reason: 'Shared setup root is not an admitted repository-relative source path.' };
    }
    const target = resolveRelative(runner.paths[0], specifier, files);
    if (!target.path || !codePath(target.path)) return { reason: target.reason ?? 'Shared setup root is not tracked code.' };
    paths.push(target.path);
  }
  return { paths: [...new Set(paths)] };
}
