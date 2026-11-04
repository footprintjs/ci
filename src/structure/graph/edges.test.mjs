import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceEdges } from './edges.mjs';
import { parseSource } from '../syntax/parse.mjs';
import { trackedFiles } from '../sources/paths.mjs';

test('duplicate import forms share one resolved source edge and keep eager reachability', () => {
  const files = trackedFiles({ files: [{ path: 'src/a.ts', text: "import './b.js'; import('./b.js');" }, { path: 'src/b.ts', text: '' }] });
  const parsed = new Map([...files].map(([path, file]) => [path, parseSource(file)]));
  const result = sourceEdges(files, parsed);
  assert.equal(result.edges.length, 1);
  assert.equal(result.edges[0].to, 'src/b.ts');
  assert.equal(result.edges[0].eager, true);
});

test('implicitly erased named reexports remain potential rather than proven eager loads', () => {
  const files = trackedFiles({ files: [{ path: 'src/index.ts', text: "export { Shape } from './shape.js';" },
    { path: 'src/shape.ts', text: 'export interface Shape {}' }] });
  const parsed = new Map([...files].map(([path, file]) => [path, parseSource(file)]));
  const result = sourceEdges(files, parsed);
  assert.equal(result.edges[0].eager, false);
  assert.equal(result.edges[0].unverified, true);
});

test('a type-position-only import is retained as potential without a proven runtime edge', () => {
  const files = trackedFiles({ files: [{ path: 'src/a.ts', text: "import { Shape } from './b.js'; export const value: Shape = {};" },
    { path: 'src/b.ts', text: 'export interface Shape {}' }] });
  const parsed = new Map([...files].map(([path, file]) => [path, parseSource(file)]));
  const result = sourceEdges(files, parsed);
  assert.equal(result.edges[0].eager, false);
  assert.equal(result.edges[0].unverified, true);
  assert.ok(result.unverified.some(item => item.kind === 'module-elision'));
});
