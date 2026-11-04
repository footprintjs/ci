import assert from 'node:assert/strict';
import test from 'node:test';
import { moveContext } from './context.mjs';
import { matchUnits } from './match.mjs';
import { bindingChanges } from './bindings.mjs';
import { snapshot } from './testing.fixture.mjs';

test('exact path and text reuse syntax without sharing snapshot metadata or units', () => {
  const input = snapshot({ 'src/work.ts': 'export function work(){return 1;}' });
  const base = moveContext(input);
  const head = moveContext({ files: [{ ...input.files[0], mode: '100755', oid: 'new' }] }, base.parsed);
  assert.equal(head.parsed.get('src/work.ts'), base.parsed.get('src/work.ts'));
  assert.notEqual(head.units[0], base.units[0]);
  assert.equal(head.byNode.get(base.units[0].node), head.units[0]);
  assert.equal(head.files.get('src/work.ts').mode, '100755');
  assert.equal(base.files.get('src/work.ts').mode, undefined);
});

test('changed text or path cannot reuse a syntax snapshot', () => {
  const text = 'export function work(){return 1;}';
  const base = moveContext(snapshot({ 'src/work.ts': text }));
  const changed = moveContext(snapshot({ 'src/work.ts': text.replace('1', '2'), 'src/other.ts': text }), base.parsed);
  assert.notEqual(changed.parsed.get('src/work.ts'), base.parsed.get('src/work.ts'));
  assert.notEqual(changed.parsed.get('src/other.ts'), base.parsed.get('src/work.ts'));
  assert.equal(changed.parsed.get('src/work.ts').text.includes('return 2'), true);
});

test('shared importer syntax still resolves ownership separately in each snapshot', () => {
  const files = { 'src/use.ts': "import {value} from './dep.js'; export function run(){return value;}",
    'src/dep.ts': "export {value} from './left.js';", 'src/left.ts': 'export const value=1;',
    'src/right.ts': 'export const value=2;' };
  const base = moveContext(snapshot(files));
  const head = moveContext(snapshot({ ...files, 'src/dep.ts': "export {value} from './right.js';" }), base.parsed);
  assert.equal(head.parsed.get('src/use.ts'), base.parsed.get('src/use.ts'));
  const result = bindingChanges(matchUnits(base, head).pairs, base, head);
  assert.ok(result.findings.some(item => item.rule === 'move-imports' && item.path === 'src/use.ts'));
});
