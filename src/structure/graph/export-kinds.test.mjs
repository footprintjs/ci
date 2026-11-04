import assert from 'node:assert/strict';
import test from 'node:test';
import { exportedKind } from './export-kinds.mjs';
import { parseSource } from '../syntax/parse.mjs';

test('erased declarations and local public aliases are distinct from real runtime values', () => {
  const parsed = parseSource({ path: 'src/a.ts', text: 'export interface Shape {} const value = 1; export { value as renamed }; export class Runtime {}' });
  assert.equal(exportedKind(parsed, 'Shape'), 'type');
  assert.equal(exportedKind(parsed, 'renamed'), 'value');
  assert.equal(exportedKind(parsed, 'Runtime'), 'value');
  assert.equal(exportedKind(parsed, 'missing'), 'unknown');
});
