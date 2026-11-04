import assert from 'node:assert/strict';
import test from 'node:test';
import { snapshotContext } from './context.mjs';
import { resolveExport } from './exports.mjs';

const context = files => snapshotContext({ files: Object.entries(files).map(([path, text]) => ({ path, text })) });

test('renamed local imports and default aliases resolve to the actual binding owner', () => {
  const source = context({ 'src/owner.ts': 'export function work() {}',
    'src/door.ts': "import { work as local } from './owner.js'; export { local as chosen }; export default local;" });
  for (const name of ['chosen', 'default']) {
    const result = resolveExport(source, 'src/door.ts', name);
    assert.deepEqual(result.owners, [{ path: 'src/owner.ts', name: 'work' }]);
    assert.deepEqual(result.unverified, []);
  }
});

test('cyclic star ownership is incomplete rather than an invented owner', () => {
  const source = context({ 'src/a.ts': "export * from './b.js';", 'src/b.ts': "export * from './a.js';" });
  const result = resolveExport(source, 'src/a.ts', 'work');
  assert.ok(result.unverified.length);
  assert.deepEqual(result.owners, []);
});

for (const body of ['export function work(value: string): string; export function work(value: number): number; export function work(value: unknown) { return value; }',
  'export interface work { value: string } export class work { value = "kept"; }']) {
  test(`erased declaration companions do not duplicate a unique runtime owner: ${body}`, () => {
    const source = context({ 'src/owner.ts': body });
    const result = resolveExport(source, 'src/owner.ts', 'work');
    assert.deepEqual(result.owners, [{path:'src/owner.ts',name:'work'}]);
    assert.deepEqual(result.unverified, []);
  });
}

test('two actual runtime implementations remain uncertain rather than a legal overload proof', () => {
  const source = context({ 'src/owner.ts': 'export function work() { return 1; } export function work() { return 2; }' });
  assert.ok(resolveExport(source, 'src/owner.ts', 'work').unverified.length);
});

test('a standalone erased declaration retains its conservative source owner rather than inventing missing exports', () => {
  const source=context({'src/types.ts':'export interface Shape {value: string}'});
  const result=resolveExport(source,'src/types.ts','Shape');
  assert.deepEqual(result.owners,[{path:'src/types.ts',name:'Shape'}]);
  assert.deepEqual(result.unverified,[]);
});
