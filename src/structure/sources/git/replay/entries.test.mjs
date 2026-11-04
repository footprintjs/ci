import assert from 'node:assert/strict';
import test from 'node:test';
import { replayEntries } from './entries.mjs';
import { repository } from './testing.fixture.mjs';

test('canonical tree data retains empty subtrees modes symlinks gitlinks and exact unusual paths',t=>{
  const {path,git,input}=repository(t);
  const empty=input(['mktree'],'');
  const blob=input(['hash-object','-w','--stdin'],'data');
  const nested=input(['mktree'],`100644 blob ${blob}\tfile.ts\n`);
  const commit=git('rev-parse','HEAD');
  const unusual='odd \n"file.ts';
  const records=[`040000 tree ${empty}\tempty`,`040000 tree ${nested}\tnested`,
    `100755 blob ${blob}\t${unusual}`,`120000 blob ${blob}\tlink`,`160000 commit ${commit}\tsub`];
  const tree=input(['mktree','-z'],records.join('\0')+'\0');
  const entries=replayEntries(path,tree);
  assert.deepEqual(entries.map(item=>[item.path,item.mode,item.type]).sort(),[
    ['empty','040000','tree'],['nested/file.ts','100644','blob'],[unusual,'100755','blob'],
    ['link','120000','blob'],['sub','160000','commit']].sort());
  assert.deepEqual(replayEntries(path,empty),[]);
});
