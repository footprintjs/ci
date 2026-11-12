import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { asRefusal } from '../../src/release-route/refusals.mjs';
import { commandArgv, readSettings } from '../../src/release-route/settings.mjs';

const family = ['storydeck', 'storyreel', 'hcifootprint', 'agentfootprint-lens'];
const fixture = (name) => readFileSync(new URL(`fixtures/family/${name}.release.json`, import.meta.url));
const storydeck = JSON.parse(fixture('storydeck'));
const bytes = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
const refusal = (value) => {
  try { readSettings(bytes(value)); } catch (error) { const r = asRefusal(error); return r.detail ? `${r.code}:${r.detail}` : r.code; }
  return 'accepted';
};

test('the settings written for the four packages are valid', () => {
  for (const name of family) {
    const settings = readSettings(fixture(name));
    assert.equal(settings.schema, 1, name);
    assert.ok(Object.isFrozen(settings) && Object.isFrozen(settings.checks), name);
  }
  const settings = readSettings(fixture('storydeck'));
  assert.deepEqual(settings.install, ['npm', 'ci']);
  assert.deepEqual(settings.checks[3], ['npx', 'publint']);
  assert.deepEqual(settings.systemPackages, ['ffmpeg']);
});

test('commands split on single spaces into npm, npx or node and a closed alphabet', () => {
  assert.deepEqual(commandArgv('npx @arethetypeswrong/cli --pack --profile esm-only', 'x'), ['npx', '@arethetypeswrong/cli', '--pack', '--profile', 'esm-only']);
  assert.deepEqual(commandArgv('node scripts/check.mjs --max=3', 'x'), ['node', 'scripts/check.mjs', '--max=3']);
  for (const text of ['npm test && npm run build', 'npm run x | tee y', 'npm run $(evil)', 'sh -c x', 'bash x', 'npm  test',
    'npm test ', ' npm test', 'npm "test"', "npm 'test'", 'npm test;x', 'npm test > out', 'npm test\nx', '', 'npm `x`', 'NPM test', '/usr/bin/npm test'])
    assert.throws(() => commandArgv(text, 'install'), (e) => asRefusal(e).code === 'settings-invalid' && asRefusal(e).detail === 'install', text);
});

test('malformed JSON, a duplicate key, a non-object root and an over-bound file are settings-json', () => {
  for (const text of ['{', '{"schema":1,"schema":1}', '[]', 'null', `{"x":"${'a'.repeat(70000)}"}`, '{"a":1} x'])
    assert.equal(refusal(text), 'settings-json', text.slice(0, 30));
});

test('an unknown key is refused by name, proposer included until the route knows it', () => {
  assert.equal(refusal({ ...storydeck, proposer: 'none' }), 'settings-unknown-key:proposer');
  assert.equal(refusal({ ...storydeck, Node: '22' }), 'settings-unknown-key:Node');
});

test('every key is required', () => {
  for (const key of Object.keys(storydeck)) {
    const { [key]: _, ...rest } = storydeck;
    assert.equal(refusal(rest), `settings-missing-key:${key}`);
  }
});

for (const [key, value] of [
  ['schema', 2], ['schema', '1'],
  ['node', 22], ['node', '22.14.0'], ['node', '18'], ['node', 'lts'],
  ['systemPackages', 'ffmpeg'], ['systemPackages', ['FFmpeg']], ['systemPackages', ['-y']], ['systemPackages', ['ffmpeg', 'ffmpeg']],
  ['systemPackages', ['a; rm']], ['systemPackages', Array.from({ length: 11 }, (_, i) => `pkg${i}`)],
  ['install', ['npm', 'ci']], ['install', 'yarn install'],
  ['checks', []], ['checks', 'npm test'], ['checks', Array(21).fill('npm test')],
  ['changelog', 'other'], ['changelog', ['titled']],
])
  test(`settings-invalid: ${key} = ${JSON.stringify(value).slice(0, 40)}`, () => {
    assert.match(refusal({ ...storydeck, [key]: value }), new RegExp(`^settings-invalid:${key.replace(/[[\]]/g, '\\$&')}`));
  });

test('a bad check names its position', () => {
  assert.equal(refusal({ ...storydeck, checks: ['npm test', 'npm test && x'] }), 'settings-invalid:checks[1]');
});

test('the archive setting is validated by its one owner', () => {
  assert.equal(refusal({ ...storydeck, archive: ['dist/', '../x'] }), 'archive-setting:entry-2');
  assert.equal(refusal({ ...storydeck, archive: [] }), 'archive-setting:list');
});
