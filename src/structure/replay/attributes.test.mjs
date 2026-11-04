import assert from 'node:assert/strict';
import test from 'node:test';
import { attributeCoverage } from './attributes.mjs';
const file = text => ({ path: '.gitattributes', text, mode: '100644' });

test('blank comments and finite linguist metadata have no merge-attribute uncertainty', () => {
  assert.deepEqual(attributeCoverage([{ id: 'fixture', files: [file('# Comment\n*.js linguist-generated\n*.ts -linguist-vendored linguist-language=TypeScript\n*.md !linguist-generated\n')] }]), []);
});
for (const text of ['*.ts merge=text', '*.ts -merge', '*.ts merge=union', '*.ts filter=custom', '[attr]named linguist-generated',
  '*.ts text linguist-generated', '"quoted pattern" linguist-generated']) test('unadmitted attribute semantics stay incomplete', () => {
  const result = attributeCoverage([{ id: 'fixture', files: [file(text)] }]);
  assert.ok(Array.isArray(result) && result.some(item => item.kind === 'merge-attributes'), 'missing attribute uncertainty');
});
test('unreadable or symlink attributes cannot be silently treated as absent', () => {
  for (const value of [{ path: '.gitattributes', text: '', content: 'path-only', mode: '100644' },
    { path: '.gitattributes', text: 'target', mode: '120000' }]) {
    const result = attributeCoverage([{ id: 'fixture', files: [value] }]);
    assert.ok(Array.isArray(result) && result.length > 0, 'missing unreadable attribute uncertainty');
  }
});
