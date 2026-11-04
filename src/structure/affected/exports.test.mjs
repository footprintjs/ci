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
