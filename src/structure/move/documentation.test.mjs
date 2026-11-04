import assert from 'node:assert/strict';
import test from 'node:test';
import { moveContext } from './context.mjs';
import { documentationNames } from './documentation.mjs';
import { snapshot } from './testing.fixture.mjs';

test('JSDoc root bindings are distinct from URL links and unsupported link syntax',()=>{
  const context=moveContext(snapshot({'src/a.ts':'/** {@link Shape.value} {@link https://example.invalid/docs} {@link "not a root"} */\nfunction work(){}'}));
  assert.deepEqual(documentationNames(context.units[0]),{names:['Shape'],unsupported:true});
});
