import assert from 'node:assert/strict';
import test from 'node:test';
import { moveContext } from './context.mjs';
import { snapshot } from './testing.fixture.mjs';

test('inventory boundaries include the complete multi-variable statement and each comment exactly once',()=>{
  const context=moveContext(snapshot({'src/a.ts':'const first=1,second=2; // owned tail\n/** Function docs. */\nfunction run(){return first+second;}'}));
  assert.equal(context.units.length,2);
  assert.equal(context.units[0].name,'first,second');
  assert.deepEqual(context.units.map(unit=>unit.comments.map(comment=>comment.text)),[['// owned tail'],['/** Function docs. */']]);
});

test('changing a declaration header changes whole-unit identity even when its body is unchanged',()=>{
  const before=moveContext(snapshot({'src/a.ts':'function work(value:string){return value;}'}));
  const after=moveContext(snapshot({'src/a.ts':'function work(value:number){return value;}'}));
  assert.notEqual(before.units[0].key,after.units[0].key);
});
