import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyMove } from './verify.mjs';
import { snapshot, simpleMove, changeFile } from './testing.fixture.mjs';

test('export-star cannot leak a newly exported private helper into an old door', () => {
  const input = simpleMove();
  changeFile(input.base, 'src/index.ts', () => "export * from './owner.js';");
  changeFile(input.head, 'src/index.ts', () => "export * from './owner.js';");
  changeFile(input.head, 'src/owner.ts', text => `${text}\nexport * from './owner/work.js';`);
  assert.ok(verifyMove(input).findings.some(item => item.rule === 'move-exports'));
});

test('a local export-type wrapper removes a public runtime value', () => {
  const input = simpleMove();
  changeFile(input.head, 'src/owner.ts', text => text.replace('export function run', 'function run') + '\nexport type { run };');
  assert.ok(verifyMove(input).findings.some(item => item.rule === 'move-exports'));
});

test('type declarations keep their TYPE kind through renamed reexports', () => {
  const body = '/** Shape docs. */\ninterface Shape { value: string }';
  const result = verifyMove({ base: snapshot({ 'src/index.ts': `export ${body.replace('/** Shape docs. */\n', '')}` }),
    head: snapshot({ 'src/index.ts': "export type { Shape } from './types.js';",
      'src/types.ts': `export ${body.replace('/** Shape docs. */\n', '')}` }) });
  assert.deepEqual(result.findings, []);
  assert.equal(result.coverage.complete, true);
});

test('unchanged public spellings cannot silently point at another retained declaration', () => {
  const files={'src/first.ts':'export function first(){return 1;}','src/second.ts':'export function second(){return 2;}',
    'src/index.ts':"export {first as work} from './first.js';"};
  const result=verifyMove({base:snapshot(files),head:snapshot({...files,'src/index.ts':"export {second as work} from './second.js';"})});
  assert.ok(result.findings.some(item=>item.rule==='move-exports'));
});

function deletedImplementation(){
  const shared={'package.json':'{"exports":{".":"./dist/index.js","./paths":"./dist/paths.js"}}',
    'src/index.ts':"export {work} from './paths.js';"};
  return {base:snapshot({...shared,'src/paths.ts':"export {work} from './lib/old.js';",
    'src/lib/old.ts':'export function work(){return 1;}'}),
    head:snapshot({...shared,'src/paths.ts':"export {work} from './lib/new.js';",
      'src/lib/new.ts':'export function work(){return 1;}'})};
}

test('a deleted private implementation can move behind the same published facade owner',()=>{
  const result=verifyMove(deletedImplementation());
  assert.deepEqual(result.findings,[]);
  assert.equal(result.coverage.complete,true);
  assert.equal(result.moves.length,1);
});

test('a deleted published door remains a finding even when the root still reaches the implementation',()=>{
  const input=deletedImplementation();
  input.head.files=input.head.files.filter(file=>file.path!=='src/paths.ts');
  changeFile(input.head,'src/index.ts',()=>"export {work} from './lib/new.js';");
  assert.ok(verifyMove(input).findings.some(item=>item.rule==='move-exports'&&item.path==='src/paths.ts'));
});

test('surviving private export modules still cannot rebind an old spelling to another declaration',()=>{
  const files={'src/first.ts':'export function first(){return 1;}','src/second.ts':'export function second(){return 2;}',
    'src/internal.ts':"export {first as work} from './first.js';"};
  const result=verifyMove({base:snapshot(files),head:snapshot({...files,'src/internal.ts':"export {second as work} from './second.js';"})});
  assert.ok(result.findings.some(item=>item.rule==='move-exports'&&item.path==='src/internal.ts'));
});

function newPrivateFacade(){
  const root={'package.json':'{"exports":{".":"./dist/index.js"}}','src/index.ts':"export {run} from './service.js';"};
  const helper='function helper(value){return value+offset;}',run='export function run(value){return helper(value);}';
  return {base:snapshot({...root,'src/service.ts':`const offset=1;${helper}${run}`}),
    head:snapshot({...root,'src/service.ts':`import {helper} from './service/helper.js';${run}`,
      'src/service/helper.ts':`import {offset} from './helper/offset.js';export ${helper}`,
      'src/service/helper/offset.ts':'export const offset=1;'})};
}

test('a newly shaped internal facade remains private under a finite closed root export map',()=>{
  const result=verifyMove(newPrivateFacade());
  assert.deepEqual(result.findings,[]);
  assert.equal(result.coverage.complete,true);
});

test('a wildcard package map leaves new facade privacy unknown rather than a definite public change',()=>{
  const input=newPrivateFacade();
  for(const snapshot of [input.base,input.head])changeFile(snapshot,'package.json',()=>'{"exports":{".":"./dist/index.js","./*":"./dist/*.js"}}');
  const result=verifyMove(input);
  assert.deepEqual(result.findings,[]);
  assert.ok(result.coverage.unverified.some(item=>item.kind==='move-door-privacy'));
});

test('an actual newly published facade still adds a public export surface',()=>{
  const input=newPrivateFacade();
  changeFile(input.head,'package.json',()=>'{"exports":{".":"./dist/index.js","./helper":"./dist/service/helper.js"}}');
  assert.ok(verifyMove(input).findings.some(item=>item.rule==='move-exports'&&item.path==='src/service/helper.ts'));
});

test('deleting a recognized sealed facade remains visible even in a closed private package scope',()=>{
  const root={'package.json':'{"exports":{".":"./dist/index.js"}}','src/index.ts':'export const root=1;',
    'src/gate/port.ts':'export const port=1;'};
  const result=verifyMove({base:snapshot({...root,'src/gate.ts':'export function work(){return 1;}'}),
    head:snapshot({...root,'src/gate/root.ts':'export function work(){return 1;}'})});
  assert.ok(result.findings.some(item=>item.rule==='move-exports'&&item.path==='src/gate.ts'));
});
