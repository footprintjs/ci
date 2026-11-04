import assert from 'node:assert/strict';
import test from 'node:test';
import { facadeAnalysis } from './analyze.mjs';
import { parseSource } from '../syntax/parse.mjs';
import { measureParsed } from '../metrics/measure.mjs';

test('trivial class wiring is permitted without granting an eager initializer exception', () => {
  const parsed = parseSource({ path: 'src/Entry.ts', text: 'export class Entry { run() { return use(); } }' });
  assert.deepEqual(facadeAnalysis(parsed, measureParsed(parsed)).findings, []);
});

test('opaque computed wiring names remain unknown rather than automatically counted as calls', () => {
  const parsed = parseSource({ path: 'src/index.ts', text: 'export class Work { [Symbol.iterator]() { return iterator(); } }' });
  const result = facadeAnalysis(parsed, measureParsed(parsed));
  assert.ok(!result.findings.some(item => item.rule === 'facade-runtime'));
  assert.ok(result.unverified.some(item => item.kind === 'facade-header'));
});

test('facade effects keep token identity when only leading wiring or docs change', () => {
  const observe = text => {
    const parsed = parseSource({ path: 'src/index.ts', text });
    return facadeAnalysis(parsed, measureParsed(parsed)).findings.find(item => item.rule === 'facade-runtime');
  };
  const before = observe('export const cache = new Map();');
  const after = observe("// docs\nimport './wire.js';\nexport const cache = new Map();");
  assert.ok(before && after);
  assert.equal(before.identity, after.identity);
  assert.equal(before.bodyHash, after.bodyHash);
});

test('class headers and computed method names cannot hide module-time effects', () => {
  for (const text of ['export class Work extends register() {}', 'export class Work { [register()]() {} }',
    'export class Work extends register().Base {}', '@register export class Work {}']) {
    const parsed = parseSource({ path: 'src/index.ts', text });
    assert.ok(facadeAnalysis(parsed, measureParsed(parsed)).findings.some(item => item.rule === 'facade-runtime'));
  }
});

test('exported callable values are wiring while invoked factories are runtime effects', () => {
  const observe = text => {
    const parsed = parseSource({ path: 'src/index.ts', text });
    return facadeAnalysis(parsed, measureParsed(parsed));
  };
  assert.deepEqual(observe('export const run = () => use();').findings, []);
  assert.deepEqual(observe('export default importedBinding;').findings, []);
  assert.ok(observe('export default construct();').findings.some(item => item.rule === 'facade-runtime'));
});

test('function initializer wiring does not hide execution in binding patterns',()=>{
  for(const text of ['const {[key()]: value}=()=>1;', 'const {missing=initialize()}=function(){};',
    'const [first]=function(){};']){
    const parsed=parseSource({path:'src/index.ts',text});
    assert.ok(facadeAnalysis(parsed,measureParsed(parsed)).findings.some(item=>item.rule==='facade-runtime'));
  }
});
