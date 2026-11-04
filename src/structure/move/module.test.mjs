import assert from 'node:assert/strict';
import test from 'node:test';
import { moveContext } from './context.mjs';
import { moduleModel } from './module.mjs';
import { snapshot } from './testing.fixture.mjs';

test('module inventory retains import aliases default local exports and their declaration nodes internally',()=>{
  const context=moveContext(snapshot({'src/a.ts':"import type {Shape as Local} from './types.js'; const value=1; export {value as chosen}; export default value;"}));
  const model=moduleModel(context,'src/a.ts');
  assert.equal(model.imports.get('Local').name,'Shape');
  assert.deepEqual([...model.exports.keys()],['chosen','default']);
  assert.ok(model.locals.get('value')?.[0].unit);
});

test('import-equals and namespace reexports explicitly require an unsupported export proof',()=>{
  const context=moveContext(snapshot({'src/a.ts':"import legacy=require('./legacy.js'); export {legacy};",'src/b.ts':"export * as namespace from './leaf.js';"}));
  assert.equal(moduleModel(context,'src/a.ts').opaque,true);
  assert.equal(moduleModel(context,'src/b.ts').opaque,true);
});
