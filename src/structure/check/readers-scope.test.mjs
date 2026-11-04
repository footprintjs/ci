import assert from 'node:assert/strict';
import test from 'node:test';
import { checkSnapshots } from './report.mjs';

const snapshot = files => ({ files: Object.entries(files).map(([path, text]) => ({ path, text })) });
function readers(report) {
  assert.ok(report.sourceReaders, 'missing reader scope');
  assert.ok(Array.isArray(report.sourceReaders.analyzedPaths), 'missing analyzed paths');
  return report.sourceReaders;
}

test('inventory skips source readers while document and comment citations remain checked', () => {
  const report = checkSnapshots(snapshot({
    'test/read.ts': "import { readFileSync } from 'node:fs'; readFileSync('src/missing.ts');",
    'docs/guide.md': 'See `src/missing.ts`.',
  }));
  assert.equal(readers(report).mode, 'skipped-inventory');
  assert.equal(readers(report).unverifiedCount, null, 'skipped is not measured zero');
  assert.deepEqual(readers(report).analyzedPaths, []);
  assert.ok(report.findings.some(item => item.rule === 'stale-path' && item.path === 'docs/guide.md'));
  assert.equal(report.findings.some(item => item.path === 'test/read.ts'), false);
});

test('comparison without lost declarations does not analyze unrelated readers', () => {
  const before = { 'src/owner.ts': 'function work() {}',
    'test/read.ts': "import { readFileSync } from 'node:fs'; readFileSync('src/owner.ts'); readFileSync(dynamic);" };
  const report = checkSnapshots(snapshot({ ...before, 'src/owner.ts': 'function work() { use(); }' }), snapshot(before));
  assert.equal(readers(report).mode, 'diff-literal-candidates');
  assert.deepEqual(readers(report).analyzedPaths, []);
  assert.equal(readers(report).unverifiedCount, 0);
});

test('only literal candidates for a lost-declaration file receive reader analysis', () => {
  const before = { 'src/owner.ts': 'export function work() {}',
    'test/read.ts': "import { readFileSync } from 'node:fs'; readFileSync('src/owner.ts');",
    'test/unrelated.ts': "import { readFileSync } from 'node:fs'; readFileSync(dynamic);" };
  const after = { ...before, 'src/owner.ts': "export { work } from './owner/work.js';", 'src/owner/work.ts': 'export function work() {}' };
  const report = checkSnapshots(snapshot(after), snapshot(before));
  assert.deepEqual(readers(report).analyzedPaths, ['test/read.ts']);
  assert.equal(readers(report).unverifiedCount, 1);
  assert.equal(report.coverage.unverified.some(item => item.kind === 'source-reader' && item.path === 'test/unrelated.ts'), false);
});

test('source literal candidates outside test folders retain the same scoped reader check', () => {
  const before = { 'src/owner.ts': 'export function work() {}',
    'src/inspect.ts': "import { readFileSync } from 'node:fs'; readFileSync('src/owner.ts');" };
  const after = { ...before, 'src/owner.ts': '' };
  assert.deepEqual(readers(checkSnapshots(snapshot(after), snapshot(before))).analyzedPaths, ['src/inspect.ts']);
});
