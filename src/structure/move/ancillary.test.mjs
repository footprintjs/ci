import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyMove } from './verify.mjs';
import { simpleMove, changeFile } from './testing.fixture.mjs';

test('source mode changes are named incomplete rather than token equivalence', () => {
  const input=simpleMove();
  input.base.files.find(file=>file.path==='src/owner.ts').mode='100644';
  input.head.files.find(file=>file.path==='src/owner.ts').mode='100755';
  const result=verifyMove(input);
  assert.equal(result.coverage.complete,false);
  assert.ok(result.coverage.unverified.some(item=>item.kind==='move-mode'));
});

test('wiring and file comment changes remain explicitly listed ancillary observations', () => {
  const input=simpleMove();
  changeFile(input.base,'src/index.ts',text=>`// Old door header.\n${text}`);
  changeFile(input.head,'src/index.ts',text=>`// New door header.\n${text}`);
  const result=verifyMove(input);
  assert.deepEqual(result.findings,[]);
  assert.ok(result.ancillaryChanges.some(item=>item.path==='src/index.ts'&&item.kind==='wiring-or-file-comments'));
});
