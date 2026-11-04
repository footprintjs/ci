import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyMove } from './verify.mjs';
import { snapshot, simpleMove, changeFile } from './testing.fixture.mjs';

const work = 'export function work(){return 1;}';
const other = 'export function other(){return 2;}';
const stale = '/** See `src/owner.ts` · `work`. */';
const relocated = '/** See `src/owner.ts` · `other`. */';
const read = 'export function read(){return 3;}';

test('unchanged comment bytes do not become a comment change when their cited owner moves', () => {
  const result = verifyMove({ base: snapshot({ 'src/owner.ts': work, 'src/read.ts': `${stale}\n${read}` }),
    head: snapshot({ 'src/owner.ts': "export {work} from './owner/work.js';", 'src/owner/work.ts': work,
      'src/read.ts': `${stale}\n${read}` }) });
  assert.equal(result.findings.some(item => item.rule === 'move-comments'), false);
  assert.ok(result.findings.some(item => item.rule === 'citation-owner' && item.path === 'src/read.ts'));
});

test('each aligned comment preserves raw bytes or proves its changed citation owner independently', () => {
  const before = `${stale}\n${relocated}\n${read}`;
  const after = `// New leaf header.\n${stale}\n${relocated.replace('src/owner.ts', 'src/owner/leaves.ts')}\n${read}`;
  const result = verifyMove({ base: snapshot({ 'src/owner.ts': `${work}\n${other}`, 'src/read.ts': before }),
    head: snapshot({ 'src/owner.ts': "export {work,other} from './owner/leaves.js';",
      'src/owner/leaves.ts': `${work}\n${other}`, 'src/read.ts': "export {read} from './read/read.js';",
      'src/read/read.ts': after }) });
  assert.equal(result.findings.some(item => item.rule === 'move-comments'), false);
  assert.ok(result.findings.some(item => item.rule === 'citation-owner' && item.path === 'src/read/read.ts'));
  assert.ok(result.ancillaryChanges.some(item => item.path === 'src/read/read.ts' && item.kind === 'added-file-header'));
});

test('changed prose is still a comment finding beside a newly stale unchanged citation', () => {
  const before = `${stale}\n/** Original prose. */\n${read}`;
  const result = verifyMove({ base: snapshot({ 'src/owner.ts': work, 'src/read.ts': before }),
    head: snapshot({ 'src/owner.ts': "export {work} from './owner/work.js';", 'src/owner/work.ts': work,
      'src/read.ts': before.replace('Original prose', 'Changed prose') }) });
  assert.ok(result.findings.some(item => item.rule === 'move-comments' && item.path === 'src/read.ts'));
});

test('raw citation text cannot impersonate an internal canonical owner identity', () => {
  const input = simpleMove();
  changeFile(input.base, 'src/owner.ts', text => text.replace('Work docs.', '`src/owner.ts` · `work`.'));
  changeFile(input.head, 'src/owner/work.ts', text => text.replace('Work docs.', '`src/owner.ts:0` · `work`.'));
  const result = verifyMove(input);
  assert.ok(result.findings.some(item => item.rule === 'move-comments'));
  assert.ok(result.findings.some(item => item.rule === 'citation-owner'));
});
