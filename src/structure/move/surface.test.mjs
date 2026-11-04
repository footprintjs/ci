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
