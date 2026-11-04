import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createPreparedSourceReader } from '../../src/propose/prepared-source.mjs';
import { producerFixture } from './fixtures.mjs';
import { sourceFixture, prepareFixture } from './prepared-fixtures.mjs';
import { zip } from './artifact-fixture.mjs';
const require=createRequire(import.meta.url), preparation=require('../../src/guards/release-prepare.cjs');
const preparedReader=createPreparedSourceReader({packageName:'foottrace',dateLaw:'source-committer-day',prepare:prepareFixture});
export function preparationWitnessFixture(changeProposal = p => p, originalSource=sourceFixture()) {
  const result=preparedReader(originalSource);assert.equal(result.valid,true);
  const p=producerFixture();p.expected.sourceSha=originalSource.commit.sha;p.expected.tree=originalSource.commit.tree.sha;
  p.run.head_sha=p.expected.sourceSha;p.job.head_sha=p.expected.sourceSha;p.artifact.workflow_run.head_sha=p.expected.sourceSha;
  p.manifest.sourceSha=p.expected.sourceSha;p.manifest.tree=p.expected.tree;
  p.expected.version=result.prepared.version;p.manifest.version=p.expected.version;
  const proposal={base:p.expected.sourceSha,tree:p.expected.tree,repository:p.expected.repository,prepared:result.prepared};
  const archive=zip([['manifest.json',JSON.stringify(p.manifest)+'\n'],['proposal.json',JSON.stringify(changeProposal(proposal))+'\n']]);
  const inventory=new Map([...originalSource.inventory].map(([name,row])=>[name,{...row}]));
  for(const [name,text] of Object.entries(result.prepared.updates)){
    const bytes=Buffer.from(text);inventory.set(name,{mode:'100644',sha:preparation.gitObject('blob',bytes),bytes});
  }
  for(const name of result.prepared.deletions)inventory.delete(name);
  const predecessor={pr:40,head:'1'.repeat(40),tree:'2'.repeat(40),merge:'3'.repeat(40)};
  const pendingSource={commit:{sha:'c'.repeat(40),tree:{sha:preparation.treeOid(inventory)},
    parents:[{sha:p.expected.sourceSha},{sha:predecessor.head}],committer:{date:'2026-11-02T02:00:00Z'}},inventory};
  delete p.manifest; // The ZIP owns manifest bytes; a caller field cannot substitute them.
  return {evidence:{...p,archive},originalSource,pendingSource,predecessor};
}
