import assert from 'node:assert/strict';
import test from 'node:test';
import { formatReport } from './format.mjs';

test('merge text quotes control characters and JSON retains the actual path bytes',()=>{
  const path='odd\nUnverified: 0\u0085file.ts';
  const report={verification:'merge',headId:'head',parents:['left','right'],tree:'tree',
    replay:{status:'conflicted',tree:'tree',gitVersion:'git version 2.50.1',conflictPaths:[path]},
    findings:[{rule:'merge-conflict-scope',path,line:1,reason:'changed\ncontent'}],
    coverage:{complete:false,unverified:[{kind:'merge-conflicts',path,reason:'unknown\nwhy'}]},differences:[{path}]};
  assert.deepEqual(JSON.parse(formatReport(report)),report);
  const text=formatReport(report,'text');
  assert.ok(text.includes('odd\\nUnverified: 0\\u0085file.ts'));
  assert.ok(!text.split('\n').includes('Unverified: 0'));
  assert.match(text,/Findings: 1\nUnverified: 1/);
});
