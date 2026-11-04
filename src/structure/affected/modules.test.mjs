import assert from 'node:assert/strict';
import test from 'node:test';
import { snapshotContext } from './context.mjs';

test('external import-equals keeps a namespace request without pretending to narrow its members', () => {
  const context = snapshotContext({ files: [{ path: 'src/a.ts', text: 'import leaf = require("./leaf.js"); export { leaf };' },
    { path: 'src/leaf.ts', text: 'export const value = 1;' }] });
  const info = context.modules.get('src/a.ts');
  assert.ok(info, 'missing module record');
  assert.equal(info.imports.get('leaf')?.target, 'src/leaf.ts');
  assert.deepEqual(info.imports.get('leaf')?.names, ['*']);
});

test('explicit type-only reexports never become runtime requests', () => {
  const context = snapshotContext({ files: [{ path: 'src/a.ts', text: 'export type { Shape } from "./missing.js";' }] });
  assert.deepEqual(context.modules.get('src/a.ts')?.requests, []);
});
