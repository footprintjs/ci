import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverDoors } from './doors.mjs';
import { trackedFiles } from './paths.mjs';

function doors(text) {
  return discoverDoors(trackedFiles({ files: [{ path: 'src/Feature.ts', text },
    { path: 'src/feature/work.ts', text: 'export function work() {}' }] }));
}

test('a pure reexport barrel stays a load door without sealing its neighbours', () => {
  const result = doors("export { work } from './feature/work.js';");
  assert.deepEqual(result.seals, []);
  assert.ok(result.paths.has('src/Feature.ts'));
});

test('imports and erased type declarations do not create a seal', () => {
  assert.deepEqual(doors("import type { T } from './feature/work.js'; export interface Shape {} export type Alias = T;").seals, []);
  assert.deepEqual(doors('export declare class Feature { run(): void; }').seals, []);
});

test('a facade with runtime class or function code remains sealed', () => {
  assert.equal(doors('export class Feature { run() {} }').seals.length, 1);
  assert.equal(doors('export function run() {}').seals.length, 1);
});
