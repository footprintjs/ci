import assert from 'node:assert/strict';
import test from 'node:test';
import { facadeAnalysis } from './index.mjs';
import { parseSource } from '../syntax/parse.mjs';
import { measureParsed } from '../metrics/measure.mjs';

test('a short facade cannot hide an eager class-field initializer', () => {
  const parsed = parseSource({ path: 'src/Entry.ts', text: 'export class Entry { cache = new Map(); run() {} }' });
  assert.ok(facadeAnalysis(parsed, measureParsed(parsed)).findings.some(item => item.rule === 'facade-runtime'));
});
