import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { declarationLossLiterals } from './declaration-loss.mjs';

const parsed = files => new Map(Object.entries(files).map(([path, text]) => [path, parseSource({ path, text })]));
const before = parsed({ 'src/owner.ts': 'function keep() {} function work() {}' });

test('only removed declaration names are listed, including type declarations', () => {
  const base = parsed({ 'src/owner.ts': 'function keep() {} function work() {} type Shape = {};' });
  const head = parsed({ 'src/owner.ts': 'function keep() {}', 'test/read.ts': "const file = 'src/owner.ts';" });
  assert.deepEqual(declarationLossLiterals(head, base), [
    { path: 'test/read.ts', line: 1, target: 'src/owner.ts', declarations: ['Shape', 'work'] },
  ]);
});

test('duplicate literals on one line are one hint, while another line remains a separate site', () => {
  const head = parsed({ 'src/owner.ts': 'function keep() {}',
    'test/read.ts': "const a = 'src/owner.ts', b = `src/owner.ts`;\nconst c = 'src/owner.ts';" });
  assert.deepEqual(declarationLossLiterals(head, before).map(item => item.line), [1, 2]);
});

test('root-relative and file-relative script literals are review hints without filesystem calls', () => {
  const head = parsed({ 'src/owner.ts': 'function keep() {}',
    'test/read.ts': "const file = './src/owner.ts';",
    'bin/check.mjs': "const file = '../src/owner.ts';" });
  assert.deepEqual(declarationLossLiterals(head, before).map(item => [item.path, item.target]), [
    ['bin/check.mjs', 'src/owner.ts'], ['test/read.ts', 'src/owner.ts'],
  ]);
});

test('constructed paths, comments and production string data are outside the cheap literal list', () => {
  const head = parsed({ 'src/owner.ts': 'function keep() {}',
    'test/read.ts': "const file = 'src/' + 'owner.ts'; // src/owner.ts",
    'src/consumer.ts': "const file = 'src/owner.ts';" });
  assert.deepEqual(declarationLossLiterals(head, before), []);
});

test('an unchanged source declaration set gives no hint even when its body changes', () => {
  const head = parsed({ 'src/owner.ts': 'function keep() { changed(); } function work() {}',
    'test/read.ts': "const file = 'src/owner.ts';" });
  assert.deepEqual(declarationLossLiterals(head, before), []);
});
