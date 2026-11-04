import assert from 'node:assert/strict';
import test from 'node:test';
import { replayPreflight } from './preflight.mjs';
import { fixture, raw } from './testing.fixture.mjs';
import { parseVersion } from './version.mjs';

test('version parsing keeps exact observed text and enforces Git2.38 minimum', () => {
  assert.equal(parseVersion(raw(0, 'git version 2.50.1 (vendor build)\n')), 'git version 2.50.1 (vendor build)');
  assert.equal(parseVersion(raw(0, 'git version 2.38.0\n')), 'git version 2.38.0');
  for (const value of [raw(0, 'git version 2.37.9\n'), raw(1, ''), raw(0, 'git version unknown\n'),
    raw(0, 'git version 2.50.1\n\n')]) {
    assert.throws(() => parseVersion(value), Error);
  }
});
test('preflight proves only explicitly supplied head and both-parent attributes', () => {
  const input = fixture(); const result = replayPreflight(input.head, input.replay.version);
  assert.ok(result && Array.isArray(result.unverified), 'missing preflight result');
  assert.deepEqual(result.unverified, []);
  input.head.attributeTrees[2].id = input.head.id;
  assert.throws(() => replayPreflight(input.head, input.replay.version), /attribute|tree/i);
});
test('nonlinguist attributes in any of three trees keep replay incomplete', () => {
  for (let index = 0; index < 3; index++) {
    const input = fixture(); input.head.attributeTrees[index].files.push({ path: 'nested/.gitattributes', mode: '100644', text: '*.ts merge=text\n' });
    const result = replayPreflight(input.head, input.replay.version);
    assert.ok(result && Array.isArray(result.unverified), 'missing preflight result');
    assert.ok(result.unverified.some(item => item.kind === 'merge-attributes' && item.path === 'nested/.gitattributes'));
  }
});
