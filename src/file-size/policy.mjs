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
  const notes = [];
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
    // A stale entry is housekeeping, never a failure: the measured base below is what holds the ratchet.
    if (!own(files, path) || files[path] <= LIMIT || excluded(path, baseline.exclude))
      notes.push(`${path}: baseline entry can be removed (missing, excluded or at most ${LIMIT} lines)`);
    else if (files[path] < cap) notes.push(`${path}: baseline can be tightened to ${files[path]} (is ${cap})`);
  }
  for (const [path, lines] of Object.entries(files)) {
    if (excluded(path, baseline.exclude)) continue;
    const cap = capOf(path, baseline, before);
    if (lines <= cap.lines) continue;
    errors.push(cap.measured
      ? `${path}: ${lines} > ${cap.lines} lines at the base commit; an oversized file may only shrink`
      : `${path}: ${lines} > ${cap.lines} lines`);
  }
  return { errors, notes, checked: Object.keys(files).filter((path) => !excluded(path, baseline.exclude)).length,
    oversized: Object.keys(baseline.files).length };
}

// One file's cap. A listed file that was oversized at the base commit may be at most the smaller of its
// stored ceiling and its measured size there, so a shrink holds without an edit to the baseline. Any other
// file (unlisted, at most LIMIT at base, or absent at base) is held to LIMIT: an entry left behind by a
// shrink or a deletion admits nothing.
function capOf(path, baseline, before) {
  if (!own(baseline.files, path) || !own(before, path) || before[path] <= LIMIT) return { lines: LIMIT, measured: false };
  const ceiling = baseline.files[path];
  return before[path] < ceiling ? { lines: before[path], measured: true } : { lines: ceiling, measured: false };
}
