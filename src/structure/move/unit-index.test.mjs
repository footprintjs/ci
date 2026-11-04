import assert from 'node:assert/strict';
import test from 'node:test';
import { unitIndex,retainedGroup,removeUnit } from './unit-index.mjs';

test('removal updates retained and moved candidate groups without changing insertion order',()=>{
  const first={path:'src/a.ts',key:'same'},second={path:'src/b.ts',key:'same'};
  const index=unitIndex([first,second]);
  assert.deepEqual([...index.byKey.get('same')],[first,second]);
  removeUnit(index,first);
  assert.equal(retainedGroup(index,first).size,0);
  assert.deepEqual([...index.byKey.get('same')],[second]);
  assert.deepEqual([...index.remaining],[second]);
});
