import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyMove } from './verify.mjs';
import { snapshot } from './testing.fixture.mjs';

function duplicates(extra = false) {
  const unit = 'function same() { return 1; }';
  return { base: snapshot({ 'src/a.ts': unit, 'src/b.ts': unit }),
    head: snapshot({ 'src/a.ts': '', 'src/b.ts': '', 'src/a/leaf.ts': `export ${unit}`,
      'src/b/leaf.ts': `export ${unit}`, ...(extra ? { 'src/c.ts': unit } : {}) }) };
}

test('equal token-duplicate multiplicity is incomplete without falsely finding a residual copy', () => {
  const result = verifyMove(duplicates());
  assert.deepEqual(result.findings, []);
  assert.equal(result.coverage.complete, false);
  assert.ok(result.coverage.unverified.some(item => item.kind === 'move-match'));
});

test('a real extra token-duplicate copy remains a finding', () => {
  assert.ok(verifyMove(duplicates(true)).findings.some(item => item.rule === 'move-residual'));
});

test('a multi-variable statement cannot be spliced into per-declarator moves', () => {
  const result = verifyMove({ base: snapshot({ 'src/a.ts': 'const first = 1, second = 2;' }),
    head: snapshot({ 'src/a.ts': '', 'src/a/first.ts': 'const first = 1;', 'src/a/second.ts': 'const second = 2;' }) });
  assert.ok(result.findings.some(item => item.rule === 'move-tokens'));
});
