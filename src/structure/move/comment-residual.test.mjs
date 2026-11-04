import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyMove } from './verify.mjs';
import { snapshot } from './testing.fixture.mjs';

test('ancillary comment observations expose counts and hashes without leaking ASTs or comment bodies',()=>{
  const before={'src/index.ts':"// Old.\nexport {work} from './work.js';",'src/work.ts':'export function work(){}'};
  const result=verifyMove({base:snapshot(before),head:snapshot({...before,'src/index.ts':"// New.\nexport {work} from './work.js';"})});
  const observation=result.ancillaryChanges.find(item=>item.kind==='wiring-or-file-comments');
  assert.ok(observation,'missing ancillary comment observation');
  assert.equal(observation.beforeCount,1);assert.equal(observation.afterCount,1);
  assert.notEqual(observation.before,observation.after);
  assert.equal(JSON.stringify(result).includes('// New.'),false);
});
