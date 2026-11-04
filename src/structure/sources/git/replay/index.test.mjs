import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFileSync,rmSync,existsSync } from 'node:fs';
import { join } from 'node:path';
import { verifyGitMerge } from './index.mjs';
import { nativeGit } from './process.mjs';
import { branches } from './testing.fixture.mjs';

function candidate(fixture,changes=[]){
  const {path,git,input,left,right}=fixture;
  const raw=nativeGit(path,['merge-tree','--write-tree','--name-only','--no-messages','-z',left,right]);
  const tree=raw.stdout.split('\0')[0];
  git('read-tree',tree);
  for(const [name,text]of changes){
    const blob=input(['hash-object','-w','--stdin'],text);
    git('update-index','--add','--cacheinfo',`100644,${blob},${name}`);
  }
  const head=input(['commit-tree',git('write-tree'),'-p',left,'-p',right],'candidate merge\n');
  return {head,tree};
}

test('native automatic replay binds actual parents and flags added clean-merge content',t=>{
  const fixture=branches(t),{path,git,left,right}=fixture;
  const clean=candidate(fixture),changed=candidate(fixture,[['extra.ts','new content\n']]);
  const before=git('count-objects','-v'),refs=git('show-ref');
  const observed=verifyGitMerge(path,clean.head);
  assert.equal(observed.headId,clean.head);assert.deepEqual(observed.parents,[left,right]);
  assert.equal(observed.replay.status,'clean');assert.equal(observed.replay.tree,clean.tree);
  assert.deepEqual(observed.findings,[]);assert.equal(observed.coverage.complete,true);
  const violation=verifyGitMerge(path,changed.head);
  assert.ok(violation.findings.some(item=>item.rule==='merge-tree'));
  assert.ok(violation.differences.some(item=>item.path==='extra.ts'));
  assert.equal(git('count-objects','-v'),before);assert.equal(git('show-ref'),refs);
});

test('native conflict resolution permits only exact conflict paths and rejects a neighbouring prefix',t=>{
  const fixture=branches(t,true);
  const resolved=candidate(fixture,[['file.ts','resolved\n']]);
  const outside=candidate(fixture,[['file.ts','resolved\n'],['file.ts.extra','unrelated addition\n']]);
  const good=verifyGitMerge(fixture.path,resolved.head);
  assert.equal(good.replay.status,'conflicted');assert.deepEqual(good.replay.conflictPaths,['file.ts']);
  assert.equal(good.coverage.complete,true);assert.deepEqual(good.findings,[]);
  const bad=verifyGitMerge(fixture.path,outside.head);
  assert.ok(bad.findings.some(item=>item.rule==='merge-conflict-scope'&&item.path==='file.ts.extra'));
});

test('unsupported parent count or attribute policy stops before native replay',t=>{
  const fixture=branches(t),{path,git}=fixture;
  const single=verifyGitMerge(path,fixture.right);
  assert.equal(single.replay.status,'not-replayed');assert.equal(single.coverage.complete,false);
  writeFileSync(join(path,'.gitattributes'),'*.ts merge=untrusted\n');
  git('add','.gitattributes');git('commit','--quiet','-m','unsupported attribute');
  fixture.right=git('rev-parse','HEAD');
  const tree=git('rev-parse',`${fixture.right}^{tree}`);
  const head=fixture.input(['commit-tree',tree,'-p',fixture.left,'-p',fixture.right],'attribute merge\n');
  const result=verifyGitMerge(path,head);
  assert.equal(result.replay.status,'not-replayed');
  assert.ok(result.coverage.unverified.some(item=>item.kind==='merge-attributes'&&item.path==='.gitattributes'));
});

test('an empty subtree added outside the conflict paths remains a visible difference',t=>{
  const fixture=branches(t,true),{path,git,input,left,right}=fixture;
  const resolved=candidate(fixture,[['file.ts','resolved\n']]);
  const empty=input(['mktree'],'');
  const records=input(['ls-tree','-z',`${resolved.head}^{tree}`]);
  const tree=input(['mktree','-z'],records+`040000 tree ${empty}\tempty\0`);
  const head=input(['commit-tree',tree,'-p',left,'-p',right],'extra empty tree\n');
  const result=verifyGitMerge(path,head);
  assert.ok(result.findings.some(item=>item.rule==='merge-conflict-scope'&&item.path==='empty'));
  assert.equal(result.differences.find(item=>item.path==='empty').after.type,'tree');
});

test('unsupported attributes in a parent remain visible when the merge tree removes them',t=>{
  const fixture=branches(t),{path,git,input,left,right}=fixture;
  git('checkout','--quiet','left');
  writeFileSync(join(path,'.gitattributes'),'*.ts merge=untrusted\n');
  git('add','.gitattributes');git('commit','--quiet','-m','parent-only attribute');
  const parent=git('rev-parse','HEAD');
  const head=input(['commit-tree',git('rev-parse',`${right}^{tree}`),'-p',parent,'-p',right],'removed attribute\n');
  const result=verifyGitMerge(path,head);
  assert.equal(result.replay.status,'not-replayed');
  assert.ok(result.coverage.unverified.some(item=>item.kind==='merge-attributes'&&item.treeId===parent));
});

test('recomputing a missing unreachable automatic tree writes no object into the source repository',t=>{
  const fixture=branches(t),{path}=fixture;
  const changed=candidate(fixture,[['extra.ts','head-only content\n']]);
  const automatic=join(path,'.git/objects',changed.tree.slice(0,2),changed.tree.slice(2));
  assert.equal(existsSync(automatic),true,'fixture did not create the unreachable automatic tree');
  rmSync(automatic);
  const result=verifyGitMerge(path,changed.head);
  assert.ok(result.findings.some(item=>item.rule==='merge-tree'));
  assert.equal(existsSync(automatic),false,'read-only replay wrote an automatic object into the source repository');
});
