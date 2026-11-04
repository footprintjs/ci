import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyMove } from './verify.mjs';

const first = '/** First whole unit. */\nfunction first() { return 1; }';
const middle = '/** Middle whole unit. */\nfunction middle() { return 2; }';
const last = '/** Last whole unit. */\nfunction last() { return 3; }';
const run = 'export function run() { return first() + middle() + last(); }';
const snapshot = (id, files) => ({ id, files: Object.entries(files).map(([path, text]) => ({ path, text })) });

function interleaved() {
  return {
    base: snapshot('base', { 'src/service.ts': `${first}\n${middle}\n${last}\n${run}` }),
    head: snapshot('head', {
      'src/service.ts': `import { first, last } from './service/ends.js';
        import { middle } from './service/middle.js';\n${run}`,
      'src/service/ends.ts': `${first.replace('function first', 'export function first')}\n${last.replace('function last', 'export function last')}`,
      'src/service/middle.ts': middle.replace('function middle', 'export function middle'),
    }),
  };
}

function observed(input) {
  const result = verifyMove(input);
  assert.ok(result && Array.isArray(result.findings), 'missing move findings');
  assert.ok(result.coverage && Array.isArray(result.coverage.unverified), 'missing move coverage');
  assert.ok(Array.isArray(result.moves), 'missing identified moves');
  return result;
}

test('one destination may combine multiple intact ordered runs when the gap moves elsewhere', () => {
  const result = observed(interleaved());
  assert.deepEqual(result.findings, []);
  assert.equal(result.coverage.complete, true);
  assert.ok(result.moves.length >= 3, 'not all whole-unit moves were identified');
});

test('multiple runs do not permit reversing their source declaration order', () => {
  const input = interleaved();
  const destination = input.head.files.find(file => file.path === 'src/service/ends.ts');
  assert.ok(destination, 'missing multi-run destination fixture');
  destination.text = `${last.replace('function last', 'export function last')}\n${first.replace('function first', 'export function first')}`;
  const result = observed(input);
  assert.deepEqual(result.findings, []);
  assert.equal(result.coverage.complete, false);
  assert.ok(result.coverage.unverified.some(item => item.kind === 'move-order'), 'missing source-order uncertainty');
});
