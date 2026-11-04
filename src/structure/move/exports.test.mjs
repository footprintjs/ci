import assert from 'node:assert/strict';
import test from 'node:test';
import { moveContext } from './context.mjs';
import { exportedNames,exportedName } from './exports.mjs';
import { snapshot } from './testing.fixture.mjs';

test('export-star follows named TYPE and VALUE owners while excluding default',()=>{
  const context=moveContext(snapshot({'src/types.ts':'export interface Shape{} export default function hidden(){} export function work(){}',
    'src/index.ts':"export * from './types.js';"}));
  assert.deepEqual(exportedNames(context,'src/index.ts').names,['Shape','work']);
  assert.deepEqual(exportedName(context,'src/index.ts','Shape').owners.map(owner=>owner.kinds),[['type']]);
  assert.deepEqual(exportedName(context,'src/index.ts','work').owners.map(owner=>owner.kinds),[['value']]);
});

test('cyclic and external stars report uncertainty instead of complete name inventories',()=>{
  const context=moveContext(snapshot({'src/a.ts':"export * from './b.js';",'src/b.ts':"export * from './a.js';",'src/external.ts':"export * from 'unknown-library';"}));
  assert.ok(exportedNames(context,'src/a.ts').reasons.length);
  assert.ok(exportedNames(context,'src/external.ts').reasons.length);
});
