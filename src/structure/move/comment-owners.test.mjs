import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { sourceComments } from '../references/comments.mjs';
import { commentOwners } from './comment-owners.mjs';

test('one partition preserves leading inside trailing and unattached EOF comment roles',()=>{
  const source=parseSource({path:'src/a.ts',text:'/** lead */ function first(){/*inside*/return 1;} //tail\n/** second */ function second(){}\n//unattached'});
  const owners=commentOwners(source,sourceComments(source));
  assert.deepEqual(owners.get(source.sourceFile.statements[0]).map(item=>item.text),['/** lead */','/*inside*/','//tail']);
  assert.deepEqual(owners.get(source.sourceFile.statements[1]).map(item=>item.text),['/** second */']);
});
