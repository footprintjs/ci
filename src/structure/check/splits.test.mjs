import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSnapshots } from './report.mjs';

const snapshot = files => ({ files: Object.entries(files).map(([path, text]) => ({ path, text })) });
const fn = (name, lines) => `function ${name}() {\n${Array.from({ length: lines }, (_, i) => `  use(${i});`).join('\n')}\n}`;
const compare = (head, base) => checkSnapshots(snapshot(head), snapshot(base)).ratchet;

test('a newly shaped facade measures its old body under the same facade rules', () => {
  const base = { 'src/Feature.ts': fn('run', 12) + '\n' + fn('helper', 7) };
  const head = { 'src/Feature.ts': "import { helper } from './feature/helper.js';\n" + fn('run', 10),
    'src/feature/helper.ts': 'export ' + fn('helper', 7) };
  const result = compare(head, base);
  assert.deepEqual(result.regressions, []);
  assert.ok(result.improved.some(item => item.rule === 'facade-lines'));
});

test('a real addition inside an existing facade still grows debt', () => {
  const common = { 'src/feature/helper.ts': 'export function helper() {}' };
  const result = compare({ ...common, 'src/Feature.ts': fn('run', 10) },
    { ...common, 'src/Feature.ts': fn('run', 9) });
  assert.ok(result.regressions.some(item => item.rule === 'facade-lines'));
});

test('a new over-limit leaf made from intact old top-level functions keeps moved debt', () => {
  const units = Array.from({ length: 7 }, (_, index) => fn(`work${String.fromCharCode(65 + index)}`, 51));
  const base = { 'src/old.ts': units.join('\n') };
  const head = { 'src/old.ts': units[6], 'src/leaf.ts': units.slice(0, 6).map(unit => 'export ' + unit).join('\n') };
  const result = compare(head, base);
  assert.deepEqual(result.regressions, []);
  assert.ok(result.existing.some(item => item.rule === 'file-code-lines' && item.matchKind === 'moved'));
});

test('a copied or newly grown leaf cannot borrow whole-unit move credit', () => {
  const units = Array.from({ length: 7 }, (_, index) => fn(`work${String.fromCharCode(65 + index)}`, 51));
  const base = { 'src/old.ts': units.join('\n') };
  for (const leaf of [units.slice(0, 6).join('\n'), units.slice(0, 5).concat(fn('newWork', 51)).join('\n')]) {
    const result = compare({ ...base, 'src/leaf.ts': leaf }, base);
    assert.ok(result.regressions.some(item => item.path === 'src/leaf.ts' && item.rule === 'file-code-lines'));
  }
});

test('net debt reduction does not excuse copied units or partial extraction', () => {
  const units = Array.from({ length: 8 }, (_, index) => fn(`work${String.fromCharCode(65 + index)}`, 51));
  const copied = compare({ 'src/old.ts': units.slice(6).join('\n'),
    'src/leaf.ts': units.slice(0, 6).concat(units[0]).map(unit => 'export ' + unit).join('\n') },
  { 'src/old.ts': units.join('\n') });
  assert.ok(copied.regressions.some(item => item.path === 'src/leaf.ts' && item.rule === 'file-code-lines'));
  const extracted = compare({ 'src/old.ts': fn('large', 51),
    'src/leaf.ts': units.slice(0, 6).join('\n') }, { 'src/old.ts': fn('large', 390) });
  assert.ok(extracted.regressions.some(item => item.path === 'src/leaf.ts' && item.rule === 'file-code-lines'));
});

test('changed declaration headers cannot borrow an unchanged runtime body', () => {
  const base = { 'src/old.ts': 'function work(a,b,c,d) { return 1; }\n'
    + 'function trouble(a,b,c,d,e,f,g,h,i,j) { return 2; }' };
  const result = compare({ 'src/leaf.ts': 'export function work(a,b,c,d,e) { return 1; }' }, base);
  assert.ok(result.regressions.some(item => item.rule === 'parameters' && item.name === 'work'));
  const old = { 'src/old.ts': "const value: string = 'x';\n" + fn('large', 390) };
  const annotation = Array.from({ length: 305 }, (_, index) => ` | 'token${index}'`).join('\n');
  const leaf = `export const value: 'x'\n${annotation} = 'x';`;
  assert.ok(compare({ 'src/leaf.ts': leaf }, old).regressions.some(item => item.rule === 'file-code-lines'));
});

test('direct-import wiring growth is allowed only when the same file code lines fall', () => {
  const dependencies = Object.fromEntries(Array.from({ length: 22 }, (_, i) => [`src/m${i}.ts`, `export const m${i} = ${i};`]));
  const imports = count => Array.from({ length: count }, (_, i) => `import './m${i}.js';`).join('\n');
  const base = { ...dependencies, 'src/entry.ts': imports(21) + '\n' + fn('run', 50) };
  const head = { ...dependencies, 'src/entry.ts': imports(22) + '\n' + fn('run', 46) };
  const result = compare(head, base);
  assert.deepEqual(result.regressions, []);
  assert.ok(result.existing.some(item => item.rule === 'direct-imports' && item.matchKind === 'split-wiring'));
  assert.ok(compare({ ...head, 'src/entry.ts': imports(22) + '\n' + fn('run', 50) }, base)
    .regressions.some(item => item.rule === 'direct-imports'));
});
