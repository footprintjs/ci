import assert from 'node:assert/strict';
import test from 'node:test';
import { checkSnapshots } from './report.mjs';

test('packed statement counts reach report JSON with counts-only grammar and no new limit',()=>{
  const text=`function packed(){${'work();'.repeat(70)}}`;
  const report=checkSnapshots({id:'candidate',files:[{path:'src/packed.ts',text}]});
  const unit=report.measurements[0].functions.find(item=>item.name==='packed');
  assert.equal(unit.statementCount,70);assert.equal(unit.codeLines,1);
  assert.equal(report.metadata.statementMetric.status,'counts-only');
  assert.equal(report.metadata.statementMetric.limit,null);
  assert.equal(report.metadata.statementMetric.expressionBodies,0);
  assert.deepEqual(report.findings,[]);
  assert.ok(!Object.keys(report.metadata.limits).some(key=>/statement/i.test(key)));
});
