import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyMove } from './verify.mjs';
import { simpleMove } from './testing.fixture.mjs';

test('unrelated unchanged legacy citation debt is listed rather than turned into a new move finding', () => {
  const input = simpleMove();
  input.base.files.push({ path: 'docs/old.md', text: 'Read `src/never-existed.ts`.' });
  input.head.files.push({ path: 'docs/old.md', text: 'Read `src/never-existed.ts`.' });
  const result = verifyMove(input);
  assert.deepEqual(result.findings, []);
  assert.equal(result.referenceScope.preExistingFindings, 1);
});

test('a source reader of the surviving old owner stays unverified with its literal listed', () => {
  const input = simpleMove();
  const reader = { path: 'test/owner.test.ts', text: "import { readFileSync } from 'node:fs'; readFileSync('src/owner.ts');" };
  input.base.files.push(reader); input.head.files.push({ ...reader });
  const result = verifyMove(input);
  assert.equal(result.coverage.complete, false);
  assert.ok(result.coverage.unverified.some(item => item.kind === 'source-reader'));
  assert.ok(result.sourceReaders.declarationLossLiterals.some(item => item.path === 'test/owner.test.ts' && item.target === 'src/owner.ts'));
});

test('unchanged legacy citation debt inside a moved unit keeps its original observation identity',()=>{
  const input=simpleMove();
  for(const snapshot of [input.base,input.head]){
    const file=snapshot.files.find(item=>item.path=== (snapshot===input.base?'src/owner.ts':'src/owner/work.ts'));
    assert.ok(file,'missing source fixture');
    file.text=file.text.replace('Work docs.','Work docs. `src/never-existed.ts`.');
  }
  const result=verifyMove(input);
  assert.deepEqual(result.findings,[]);
  assert.equal(result.referenceScope.preExistingFindings,1);
});
