import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyMove } from './verify.mjs';
import { snapshot, simpleMove, changeFile } from './testing.fixture.mjs';

test('a same-line trailing comment moves only with its preceding whole unit', () => {
  const first = 'function first() { return 1; } // first owned tail';
  const second = 'export function second() { return first(); }';
  const result = verifyMove({ base: snapshot({ 'src/a.ts': `${first}\n${second}` }),
    head: snapshot({ 'src/a.ts': `import { first } from './a/first.js';\n${second}`,
      'src/a/first.ts': `export ${first}` }) });
  assert.deepEqual(result.findings, []);
  assert.equal(result.coverage.complete, true);
});

test('an added new-file header is listed separately without deleting owned docs', () => {
  const input = simpleMove();
  changeFile(input.head, 'src/owner/work.ts', text => `// File support header.\n${text}`);
  const result = verifyMove(input);
  assert.deepEqual(result.findings, []);
  assert.ok(result.ancillaryChanges.some(item => item.kind === 'added-file-header'));
});

test('an inline comment moved across expression tokens is a comment change', () => {
  const input = simpleMove();
  changeFile(input.base, 'src/owner.ts', text => text.replace('value + 1', 'value /* owned */ + 1'));
  changeFile(input.head, 'src/owner/work.ts', text => text.replace('value + 1', 'value + /* owned */ 1'));
  assert.ok(verifyMove(input).findings.some(item => item.rule === 'move-comments'));
});

test('an owned citation may relocate only to its same matched declaration owner', () => {
  const input = simpleMove();
  changeFile(input.base, 'src/owner.ts', text => text.replace('Work docs.', 'Work docs. `src/owner.ts` · `work`.'));
  changeFile(input.head, 'src/owner/work.ts', text => text.replace('Work docs.', 'Work docs. `src/owner/work.ts` · `work`.'));
  const result = verifyMove(input);
  assert.deepEqual(result.findings, []);
  assert.equal(result.coverage.complete, true);
});

test('nested declaration citations relocate with their exact whole class owner',()=>{
  const body='/** See `src/a.ts` · `Gate.open`. */\nclass Gate { open(){return 1;} }';
  const result=verifyMove({base:snapshot({'src/a.ts':body}),head:snapshot({'src/a.ts':"import {Gate} from './a/gate.js';",
    'src/a/gate.ts':body.replace('src/a.ts','src/a/gate.ts').replace('class Gate','export class Gate')})});
  assert.deepEqual(result.findings,[]);
  assert.ok(result.coverage.unverified.some(item=>item.kind==='load-order'));
});
