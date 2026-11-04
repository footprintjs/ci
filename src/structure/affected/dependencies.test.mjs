import assert from 'node:assert/strict';
import test from 'node:test';
import { snapshotContext } from './context.mjs';
import { testDependencies } from './dependencies.mjs';

test('an inert unrequested named export stays outside the selected owner closure', () => {
  const files = { 'src/index.ts': "export { first } from './first.js'; export { second } from './second.js';",
    'src/first.ts': 'export function first() {}', 'src/second.ts': 'export const second = 1;',
    'test/first.test.ts': "import { first } from '../src/index.js'; first();" };
  const context = snapshotContext({ files: Object.entries(files).map(([path, text]) => ({ path, text })) });
  const result = testDependencies(context, 'test/first.test.ts');
  assert.ok(result.paths.has('src/first.ts'));
  assert.equal(result.paths.has('src/second.ts'), false);
});

test('filesystem imports in a reachable helper propagate always-run classification', () => {
  const context = snapshotContext({ files: [{ path: 'src/read.ts', text: "import { readFileSync } from 'node:fs'; export function read() { return readFileSync(path); }" },
    { path: 'test/read.test.ts', text: "import { read } from '../src/read.js'; read();" }] });
  assert.equal(testDependencies(context, 'test/read.test.ts').reader, true);
});
