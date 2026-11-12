import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCommit, isNodeMajor, isPackageName, isPlainVersion, newerThanAll } from '../../src/release-route/identity.mjs';

test('plain versions only', () => {
  for (const v of ['0.0.0', '0.13.1', '12.0.0', '999999999.0.1']) assert.equal(isPlainVersion(v), true, v);
  for (const v of ['1.0', '01.0.0', '1.0.0-rc.0', '1.0.0+build', 'v1.0.0', ' 1.0.0', '1.0.0\n', '1000000000.0.0', 1])
    assert.equal(isPlainVersion(v), false, String(v));
});

test('commits are 40 lowercase hex and never all zeros', () => {
  assert.equal(isCommit('a'.repeat(40)), true);
  for (const v of ['A'.repeat(40), 'a'.repeat(39), '0'.repeat(40), `${'a'.repeat(40)}\n`, undefined]) assert.equal(isCommit(v), false);
});

test('npm package names', () => {
  for (const v of ['footprint-storydeck', '@footprintjs/release-flow', 'a.b_c-d']) assert.equal(isPackageName(v), true, v);
  for (const v of ['Upper', '-x', '.x', '@scope', '@/x', 'a b', 'x'.repeat(215), '', 'a/b', '../x']) assert.equal(isPackageName(v), false, v);
});

test('a Node major is the text "22" to "99", nothing around it', () => {
  for (const v of ['22', '24', '30', '99']) assert.equal(isNodeMajor(v), true, v);
  for (const v of ['21', '18', '100', '22.14.0', 'v22', ' 22', '22\n', '022', 'lts', '', 22, undefined]) assert.equal(isNodeMajor(v), false, String(v));
});

test('newer than every published version, prereleases included', () => {
  assert.equal(newerThanAll('0.13.2', ['0.13.1', '0.13.0', '0.1.0']), true);
  assert.equal(newerThanAll('1.0.0', ['1.0.0-rc.1', '0.9.9']), true);
  assert.equal(newerThanAll('0.13.1', ['0.13.1']), false);
  assert.equal(newerThanAll('1.9.0', ['2.0.0-rc.0']), false);
  assert.equal(newerThanAll('1.0.0', ['1.0.1']), false);
  assert.equal(newerThanAll('2.0.0', ['10.0.0']), false);
  assert.equal(newerThanAll('1.0.0', []), true);
});

test('an unreadable published version or a non-plain candidate is "could not read", never "older"', () => {
  assert.equal(newerThanAll('2.0.0', ['1.0.0', 'garbage']), null);
  assert.equal(newerThanAll('2.0.0-rc.1', ['1.0.0']), null);
  assert.equal(newerThanAll('2.0.0', 'not a list'), null);
  assert.equal(newerThanAll('2.0.0', [`1.0.${'9'.repeat(400)}`]), null);
});
