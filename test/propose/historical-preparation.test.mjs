import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistoricalPreparationReader } from '../../src/propose/historical-preparation.mjs';
import { createFoottracePreparationProfile } from '../../src/propose/foottrace-profile.mjs';
import { preparationWitnessFixture as fixture } from './preparation-witness-fixture.mjs';
const read=createHistoricalPreparationReader(createFoottracePreparationProfile());
test('binds actual ZIP members, original preparation and the full pending tree without granting release authority',()=>{
  const f=fixture(), result=read(f);assert.equal(result.valid,true);
  assert.equal(result.scope,'prepared-inputs-only');assert.equal(result.pendingSha,f.pendingSource.commit.sha);
  assert.equal(result.pendingTree,f.pendingSource.commit.tree.sha);assert.equal(result.sourceSha,f.originalSource.commit.sha);
  assert.equal(result.queue[0].path,'.changes/first.md');assert.equal(Object.hasOwn(result,'authorized'),false);
});
for(const [name,mutate] of [
  ['wrong manifest binding',f=>{f.evidence.job.id++;}],
  ['wrong original base',f=>{f.originalSource.commit.sha='e'.repeat(40);}],
  ['wrong pending parent',f=>{f.pendingSource.commit.parents[0].sha='e'.repeat(40);}],
  ['wrong original published parent',f=>{f.pendingSource.commit.parents[1].sha='e'.repeat(40);}],
  ['extra pending parent',f=>{f.pendingSource.commit.parents.push({sha:'e'.repeat(40)});}],
  ['pending confused with predecessor',f=>{f.predecessor.head=f.pendingSource.commit.sha;}],
  ['wrong pending inventory',f=>{f.pendingSource.inventory.delete('src/unchanged.ts');}],
])test(`refuses ${name}`,()=>{const f=fixture();mutate(f);assert.equal(read(f).valid,false);});
test('refuses a substituted prepared proposal even if the artifact envelope still matches',()=>{
  const f=fixture(p=>({...p,prepared:{...p.prepared,notes:'Substituted'}}));assert.equal(read(f).valid,false);
});
