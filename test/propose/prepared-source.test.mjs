import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createPreparedSourceReader } from '../../src/propose/prepared-source.mjs';
const require = createRequire(import.meta.url), preparation = require('../../src/guards/release-prepare.cjs');
import { sourceFixture as fixture, prepareFixture as adapter } from './prepared-fixtures.mjs';
const read = createPreparedSourceReader({packageName:'foottrace',dateLaw:'source-committer-day',prepare:adapter});
test('rebuilds the entire prepared tree from the immutable source and original raw queue',()=>{
  const source=fixture(),before=Buffer.from(source.inventory.get('package.json').bytes);
  const result=read(source);assert.equal(result.valid,true);
  assert.equal(result.sourceSha,source.commit.sha);assert.equal(result.sourceTree,source.commit.tree.sha);
  assert.equal(result.date,'2026-11-02');assert.equal(result.prepared.version,'1.10.1');
  assert.equal(result.queue[0].path,'.changes/first.md');assert.equal(result.prepared.deletions[0],'.changes/first.md');
  assert.match(result.tree,/^[a-f0-9]{40}$/);assert.notEqual(result.tree,source.commit.tree.sha);
  assert.equal(source.inventory.has('.changes/first.md'),true);assert.deepEqual(source.inventory.get('package.json').bytes,before);
});
for(const [name,change] of [
  ['wrong whole tree',f=>{f.commit.tree.sha='e'.repeat(40);}],
  ['wrong raw blob',f=>{f.inventory.get('package.json').bytes[0]=0;}],
  ['missing semantic bytes',f=>{delete f.inventory.get('package.json').bytes;}],
  ['changed hashed-only identity',f=>{f.inventory.get('src/unchanged.ts').sha='e'.repeat(40);}],
  ['invalid date',f=>{f.commit.committer.date='not-a-date';}],
  ['invalid mode',f=>{f.inventory.get('README.md').mode='120000';}],
])test(`refuses ${name}`,()=>{const f=fixture();change(f);assert.equal(read(f).valid,false);});

for (const [name, change] of [
  ['version inconsistent with queue',p=>{p.version='2.0.0';p.tag='v2.0.0';p.bump='major';}],
  ['extra fragment deletion',p=>{p.deletions.push('README.md');}],
  ['lost original queue deletion',p=>{p.deletions=[];}],
  ['package/lock disagreement',p=>{p.updates['package.json']='{"name":"foottrace","version":"9.0.0"}\n';}],
])test(`refuses adapter output: ${name}`,()=>{
  const inspect=createPreparedSourceReader({packageName:'foottrace',dateLaw:'source-committer-day',prepare:input=>{const p=adapter(input);change(p);return p;}});
  assert.equal(inspect(fixture()).valid,false);
});

test('copies semantic buffers before invoking the trusted adapter',()=>{
  const f=fixture(), original=Buffer.from(f.inventory.get('README.md').bytes);
  const inspect=createPreparedSourceReader({packageName:'foottrace',dateLaw:'source-committer-day',prepare:input=>{
    const p=adapter(input);input.inventory.get('README.md').bytes[0]=0;return p;
  }});
  assert.equal(inspect(f).valid,true);assert.deepEqual(f.inventory.get('README.md').bytes,original);
});

test('does not invoke source row getters',()=>{
  const f=fixture();let calls=0;
  Object.defineProperty(f.inventory.get('README.md'),'bytes',{get(){calls++;return Buffer.from('bad');}});
  assert.equal(read(f).valid,false);assert.equal(calls,0);
});
