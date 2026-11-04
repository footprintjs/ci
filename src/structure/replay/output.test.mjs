import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMergeOutput } from './output.mjs';
import { raw, ids } from './testing.fixture.mjs';

test('pinned clean NUL protocol contains exactly one tree', () => {
  assert.deepEqual(parseMergeOutput(raw(0, `${ids.tree}\0`), 40), { status: 'clean', tree: ids.tree, conflictPaths: [] });
});
test('conflicted NUL paths preserve newlines quotes spaces and leading hyphens', () => {
  const paths = ['src/a\n"odd.ts', '-leading name'];
  assert.deepEqual(parseMergeOutput(raw(1, `${ids.tree}\0${paths.join('\0')}\0`), 40),
    { status: 'conflicted', tree: ids.tree, conflictPaths: paths });
});
for (const [name, value] of [ ['missing ref', raw(1, '', 'not something we can merge')],
  ['unrelated', raw(128, '')], ['truncated', raw(0, ids.tree)], ['extra clean record', raw(0, `${ids.tree}\0x\0`)],
  ['empty conflict record', raw(1, `${ids.tree}\0\0`)], ['wrong width', raw(0, `${'a'.repeat(64)}\0`)],
  ['invalid Unicode', raw(1, `${ids.tree}\0\ud800\0`)], ['escaping path', raw(1, `${ids.tree}\0../x\0`)],
  ['duplicate paths', raw(1, `${ids.tree}\0x\0x\0`)] ]) test(`${name} is a tool/input error`, () => {
  assert.throws(() => parseMergeOutput(value, 40), Error);
});
