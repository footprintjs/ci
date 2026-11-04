import assert from 'node:assert/strict';
import test from 'node:test';
import { fileFindings } from './files.mjs';

test('comment-heavy files retain physical-size findings without code-size findings', () => {
  const source = { path: 'src/documented.ts', physicalLines: 601, codeLines: 10, classes: [] };
  assert.deepEqual(fileFindings(source).map(item => item.rule), ['file-physical-lines']);
});
