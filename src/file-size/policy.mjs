// Pure rule-20 policy. All paths/counts come from the caller's committed Git trees.
const LIMIT = 600;
const own = (value, key) => Object.hasOwn(value, key);
const pathOK = (path) => typeof path === 'string' && path.startsWith('src/') && path !== 'src/' &&
  !path.includes('\\') && !path.includes('\0') && !path.split('/').some((part, i, all) =>
    part === '.' || part === '..' || (part === '' && i !== all.length - 1));
const excluded = (path, entries) => entries.some((entry) => path === entry.path ||
  (entry.path.endsWith('/') && path.startsWith(entry.path)));

export function validateBaseline(value) {
  const invalid = () => { throw new Error('invalid file-size baseline: expected { files: { src/path: integer > 600 }, exclude: [{ path, reason }] }'); };
  if (!value || Array.isArray(value) || typeof value !== 'object' ||
      Object.keys(value).sort().join(',') !== 'exclude,files' || !value.files ||
      typeof value.files !== 'object' || Array.isArray(value.files) || !Array.isArray(value.exclude)) invalid();
  for (const [path, lines] of Object.entries(value.files)) {
    if (!pathOK(path) || path.endsWith('/') || !Number.isSafeInteger(lines) || lines <= LIMIT) invalid();
  }
  const seen = new Set();
  for (const entry of value.exclude) {
    if (!entry || Object.keys(entry).sort().join(',') !== 'path,reason' || !pathOK(entry.path) ||
        !['generated', 'vendored', 'test'].includes(entry.reason) || seen.has(entry.path)) invalid();
    seen.add(entry.path);
  }
  return value;
}

export function checkFileSizes({ files, baseline, previous, before }) {
  validateBaseline(baseline);
  if (previous !== null) validateBaseline(previous);
  const errors = [];
  if (previous !== null) {
    for (const entry of baseline.exclude) {
      if (!previous.exclude.some((old) => old.path === entry.path && old.reason === entry.reason))
        errors.push(`${entry.path}: new exclusion; the exception list may only shrink`);
    }
  }
  for (const [path, cap] of Object.entries(baseline.files)) {
    if (previous !== null) {
      if (!own(previous.files, path)) errors.push(`${path}: new baseline entry; split new oversized files instead`);
      else if (cap > previous.files[path]) errors.push(`${path}: baseline increased ${previous.files[path]} -> ${cap}`);
    } else if (!own(before, path) || before[path] <= LIMIT) {
      errors.push(`${path}: not oversized at base; cannot seed an exception`);
    } else if (cap > before[path]) {
      errors.push(`${path}: ${cap} > ${before[path]} at base`);
    }
    if (!own(files, path) || files[path] <= LIMIT || excluded(path, baseline.exclude))
      errors.push(`${path}: remove baseline entry (missing, excluded or at most ${LIMIT} lines)`);
    else if (files[path] < cap) errors.push(`${path}: tighten baseline to ${files[path]} (was ${cap})`);
  }
  for (const [path, lines] of Object.entries(files)) {
    if (excluded(path, baseline.exclude)) continue;
    const cap = own(baseline.files, path) ? baseline.files[path] : LIMIT;
    if (lines > cap) errors.push(`${path}: ${lines} > ${cap} lines`);
  }
  return { errors, checked: Object.keys(files).filter((path) => !excluded(path, baseline.exclude)).length,
    oversized: Object.keys(baseline.files).length };
}
