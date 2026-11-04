import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('hosted reproducibility gate covers both committed writer artifacts',()=>{
 const workflow=readFileSync('.github/workflows/check.yml','utf8');
 const drift=workflow.split('\n').find(x=>x.includes('git diff --exit-code --'));
 assert.ok(drift,'normal hosted committed artifact check absent');
 const words=drift.trim().split(/\s+/),separator=words.indexOf('--');
 assert.ok(separator>=0);const files=words.slice(separator+1);
 for(const file of ['dist/propose-writer.cjs','dist/propose-writer-metadata.json'])
  assert.ok(files.includes(file),'hosted drift check omits '+file);
});
