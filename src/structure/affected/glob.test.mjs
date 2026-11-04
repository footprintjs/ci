import assert from 'node:assert/strict';
import test from 'node:test';
import { literalGlob } from './glob.mjs';

test('finite recursive globs admit direct and nested tests without treating dots as wildcards', () => {
  const pattern = literalGlob('test/**/*.test.ts');
  assert.ok(pattern);
  assert.equal(pattern.test('test/a.test.ts'), true);
  assert.equal(pattern.test('test/nested/a.test.ts'), true);
  assert.equal(pattern.test('test/aXtestYts'), false);
  assert.equal(pattern.test('src/a.test.ts'), false);
});

test('unsupported glob semantics are unknown rather than silently excluded', () => {
  for (const value of ['!test/a.ts', 'test/*.{ts,js}', 'test/[ab].ts', '../test/*.ts', '/test/*.ts']) assert.equal(literalGlob(value), null);
});

test('ordinary dot-relative include paths still admit repository-relative tracked tests', () => {
  const pattern = literalGlob('./test/**/*.test.ts');
  assert.ok(pattern);
  assert.equal(pattern.test('test/a.test.ts'), true);
});
