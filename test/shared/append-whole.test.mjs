// appendWhole: an append that lands whole or not at all. A write that fails part-way (a full disk,
// a quota, a write that took fewer bytes and then failed) is undone by cutting the file back to the
// size it had, through the same descriptor; the first error is the one thrown.
import assert from 'node:assert/strict';
import fs, { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { appendWhole } from '../../src/shared/append-whole.mjs';

const folder = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'append-whole-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const TEXT = 'rule=publish\ncommit=61e129bc36359b5826f7d896bcbe1f617085a3fa\ncompare=yes\nmode=publish\n';
const ENOSPC = () => Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' });

// The real file system, with writeSync replaced: each call is handed to `write(real, args, n)`,
// n counting from 1. Everything else is node:fs itself, so the file is real.
function io(write, overrides = {}) {
  let n = 0;
  const calls = [];
  const wrapped = { ...fs, ...overrides };
  for (const name of ['openSync', 'fstatSync', 'ftruncateSync', 'closeSync']) {
    const inner = wrapped[name];
    wrapped[name] = (...args) => { calls.push(name); return inner(...args); };
  }
  wrapped.writeSync = (fd, buffer, offset, length) => {
    calls.push('writeSync');
    return write((len) => fs.writeSync(fd, buffer, offset, len), length, ++n);
  };
  return { io: wrapped, calls };
}

for (const [label, before] of [['a file that already holds text', 'earlier=yes\n'], ['an empty file', '']]) {
  test(`a write that takes half the bytes and then fails leaves ${label} as it was`, (t) => {
    const file = join(folder(t), 'out');
    writeFileSync(file, before);
    const { io: halfThenFail } = io((write, length, n) => { if (n === 1) return write(Math.floor(length / 2)); throw ENOSPC(); });
    assert.throws(() => appendWhole(file, TEXT, halfThenFail), /ENOSPC/);
    assert.equal(readFileSync(file, 'utf8'), before);
  });
}

test('a write that fails on its very last byte leaves the file as it was: no whole mode line', (t) => {
  const file = join(folder(t), 'out');
  writeFileSync(file, 'earlier=yes\n');
  const { io: lastByte } = io((write, length) => { if (length > 1) return write(length - 1); throw ENOSPC(); });
  assert.throws(() => appendWhole(file, TEXT, lastByte), /ENOSPC/);
  assert.equal(readFileSync(file, 'utf8'), 'earlier=yes\n');
});

test('when cutting back fails too, the first error is thrown and nothing else is attempted', (t) => {
  const file = join(folder(t), 'out');
  writeFileSync(file, '');
  const cutFails = Object.assign(new Error('EIO: cut back'), { code: 'EIO' });
  const { io: both, calls } = io((write, length, n) => { if (n === 1) return write(3); throw ENOSPC(); },
    { ftruncateSync: () => { throw cutFails; } });
  assert.throws(() => appendWhole(file, TEXT, both), (error) => error.code === 'ENOSPC');
  assert.deepEqual(calls, ['openSync', 'fstatSync', 'writeSync', 'writeSync', 'ftruncateSync', 'closeSync']);
});

// What the words in report.mjs and docs/RELEASE-ROUTE.md say is left: a failure on the very last
// byte (the final newline) together with a failed cut-back leaves a whole `mode` with no newline.
// Pinned so the sentence cannot drift back to "a line cut part-way before a whole mode".
test('a failure on the last byte AND a failed cut-back leaves a whole mode line with no newline', (t) => {
  const file = join(folder(t), 'out');
  writeFileSync(file, '');
  const { io: both } = io((write, length) => { if (length > 1) return write(length - 1); throw ENOSPC(); },
    { ftruncateSync: () => { throw new Error('EIO: cut back'); } });
  assert.throws(() => appendWhole(file, TEXT, both), (error) => error.code === 'ENOSPC');
  assert.equal(readFileSync(file, 'utf8'), TEXT.slice(0, -1));
  assert.match(readFileSync(file, 'utf8'), /(^|\n)mode=publish$/);
});

test('a write that takes fewer bytes is continued until the whole text is written', (t) => {
  const file = join(folder(t), 'out');
  writeFileSync(file, 'earlier=yes\n');
  const { io: small, calls } = io((write, length) => write(Math.min(length, 7)));
  appendWhole(file, TEXT, small);
  assert.equal(readFileSync(file, 'utf8'), `earlier=yes\n${TEXT}`);
  assert.equal(calls.at(-1), 'closeSync');
});

test('a write that takes nothing is a failure, not a loop: the file is left as it was', (t) => {
  const file = join(folder(t), 'out');
  writeFileSync(file, 'earlier=yes\n');
  const { io: none } = io(() => 0);
  assert.throws(() => appendWhole(file, TEXT, none), /wrote nothing/);
  assert.equal(readFileSync(file, 'utf8'), 'earlier=yes\n');
});

test('end to end on a real file: appends, creates a missing file, and refuses a folder without leaving anything', (t) => {
  const dir = folder(t);
  const file = join(dir, 'out');
  appendWhole(file, 'a=1\n');
  appendWhole(file, 'b=2\n');
  assert.equal(readFileSync(file, 'utf8'), 'a=1\nb=2\n');
  assert.throws(() => appendWhole(dir, 'a=1\n'));
  assert.throws(() => appendWhole(join(dir, 'missing', 'out'), 'a=1\n'));
});
