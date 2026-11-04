import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { referenceAnalysis, sourceReaderAnalysis } from './analyze.mjs';

const owners = {
  'src/owner.ts': "export { work } from './owner/work.js';",
  'src/owner/work.ts': 'export function work() {}',
};
const importReader = "import { readFileSync } from 'node:fs';";

function observed(extra) {
  const files = new Map(Object.entries({ ...owners, ...extra }).map(([path, text]) => [path, { path, text }]));
  const parsed = new Map([...files].filter(([path]) => /\.[cm]?[jt]sx?$/.test(path))
    .map(([path, file]) => [path, parseSource(file)]));
  const comments = referenceAnalysis(files, parsed);
  const readers = sourceReaderAnalysis(files, parsed, files.keys());
  const result = { findings: [...comments.findings, ...readers.findings],
    unverified: [...comments.unverified, ...readers.unverified] };
  assert.ok(result && Array.isArray(result.findings), 'missing reference findings');
  assert.ok(Array.isArray(result.unverified), 'missing reference uncertainty');
  return result;
}

function unknownIntent(result, path) {
  const found = result.unverified.find(item => item.kind === 'source-reader' && item.path === path
    && typeof item.reason === 'string' && /intent|ownership/i.test(item.reason));
  assert.ok(found, `missing qualified reader-intent uncertainty: ${path}`);
  return found;
}

function noRule(result, rule) {
  assert.deepEqual(result.findings.filter(item => item.rule === rule), []);
}

test('an existing literal source path establishes existence but not a declaration obligation', () => {
  const result = observed({ 'test/read.ts': `${importReader}\nreadFileSync('src/owner.ts', 'utf8');` });
  unknownIntent(result, 'test/read.ts');
  noRule(result, 'stale-path');
  noRule(result, 'citation-owner');
});

test('a literal source-text declaration check does not silently define a new ownership grammar', () => {
  const source = `${importReader}
    const source = readFileSync('src/owner.ts', 'utf8');
    if (!source.includes('function work')) throw new Error('expected work declaration');`;
  const result = observed({ 'test/read.ts': source });
  unknownIntent(result, 'test/read.ts');
  noRule(result, 'stale-path');
  noRule(result, 'citation-owner');
});

test('arbitrary regex helper dataflow is not an inferred declaration-owner assertion', () => {
  const source = `${importReader}
    function names(source, name) { return new RegExp(name).test(source); }
    const source = readFileSync('src/owner.ts', 'utf8'); names(source, 'work');`;
  const result = observed({ 'test/read.ts': source });
  unknownIntent(result, 'test/read.ts');
  noRule(result, 'citation-owner');
});

test('a whole-file size reader has qualified unknown intent without a targeted rule finding', () => {
  const source = `${importReader}
    const source = readFileSync('src/owner.ts', 'utf8');
    if (source.length > expectedBytes) throw new Error('size changed');`;
  const result = observed({ 'test/read.ts': source });
  unknownIntent(result, 'test/read.ts');
  assert.deepEqual(result.findings, []);
});

test('unknown semantic intent does not erase a definite missing-path finding', () => {
  const result = observed({ 'test/read.ts': `${importReader}\nreadFileSync('src/missing.ts', 'utf8');` });
  assert.ok(result.findings.some(item => item.rule === 'stale-path' && item.path === 'test/read.ts'));
  noRule(result, 'citation-owner');
});

test('an explicit owner citation still uses the actual declaration rather than a facade reexport', () => {
  const result = observed({ 'test/read.ts': `${importReader}
    // The declaration owner is \`src/owner.ts\` · \`work\`.
    readFileSync('src/owner.ts', 'utf8');` });
  assert.ok(result.findings.some(item => item.rule === 'citation-owner'));
  unknownIntent(result, 'test/read.ts');
});

test('a valid nearby citation is separate from the semantic intent of a source reader', () => {
  const result = observed({ 'test/read.ts': `${importReader}
    // The declaration owner is \`src/owner/work.ts\` · \`work\`.
    readFileSync('src/owner.ts', 'utf8');` });
  noRule(result, 'stale-path');
  noRule(result, 'citation-owner');
  unknownIntent(result, 'test/read.ts');
});
