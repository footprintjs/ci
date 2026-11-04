import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyMove } from './verify.mjs';

const helper = '/** Owned helper docs. */\nfunction helper(value) {\n  return convert(value);\n}';
const run = '/** Public wiring docs. */\nexport function run(value) {\n  return helper(value);\n}';
const originalImport = "import { transform as convert } from './deps/transform.js';";
const leafImport = "import { transform as convert } from '../deps/transform.js';";
const dependencies = {
  'src/deps/transform.ts': 'export function transform(value) { return value; }',
  'src/other/transform.ts': 'export function transform(value) { return value + 1; }',
  'src/index.ts': "export { run } from './service.js';",
};
const snapshot = (id, files) => ({ id, files: Object.entries(files).map(([path, text]) => ({ path, text })) });

function fixture() {
  const base = snapshot('base', { ...dependencies, 'src/service.ts': `${originalImport}\n\n${helper}\n\n${run}\n` });
  const head = snapshot('head', { ...dependencies,
    'src/service.ts': `import { helper } from './service/helper.js';\n\n${run}\n`,
    'src/service/helper.ts': `${leafImport}\n\n${helper.replace('function helper', 'export function helper')}\n`,
  });
  return { base, head };
}

function replaceFile(snapshot, path, change) {
  const file = snapshot.files.find(item => item.path === path);
  assert.ok(file, `missing fixture source ${path}`);
  file.text = change(file.text);
}

function observed(input) {
  const result = verifyMove(input);
  assert.ok(result && typeof result === 'object', 'missing move observation');
  assert.ok(Array.isArray(result.findings), 'missing move findings');
  assert.ok(result.coverage && Array.isArray(result.coverage.unverified), 'missing move coverage');
  assert.ok(Array.isArray(result.moves), 'missing identified moves');
  assert.ok(Array.isArray(result.ancillaryChanges), 'missing ancillary changes');
  return result;
}

function rejected(result, rule) {
  assert.ok(result.findings.some(item => item.rule === rule), `missing ${rule} finding`);
}

function admitted(result) {
  assert.deepEqual(result.findings, []);
  assert.equal(result.coverage.complete, true);
  assert.deepEqual(result.coverage.unverified, []);
  assert.ok(result.moves.length > 0, 'no whole-unit move was identified');
}

test('a complete runtime helper retains tokens comments and public wiring', () => {
  admitted(observed(fixture()));
});

test('adding only the private helper export is permitted', () => {
  const input = fixture();
  const leaf = input.head.files.find(item => item.path === 'src/service/helper.ts');
  assert.ok(leaf, 'missing moved helper source');
  assert.ok(leaf.text.includes('export function helper'));
  admitted(observed(input));
});

test('changing a moved expression is not a whole-unit move', () => {
  const input = fixture();
  replaceFile(input.head, 'src/service/helper.ts', text => text.replace('convert(value)', 'convert(value + 1)'));
  rejected(observed(input), 'move-tokens');
});

test('owned comments are preserved even when runtime tokens stay the same', () => {
  const input = fixture();
  replaceFile(input.head, 'src/service/helper.ts', text => text.replace('Owned helper docs.', 'Different helper docs.'));
  rejected(observed(input), 'move-comments');
});

test('resolved static import owners survive relative-path relocation', () => {
  const input = fixture();
  admitted(observed(input));
  replaceFile(input.head, 'src/service/helper.ts', text => text.replace('../deps/transform.js', '../other/transform.js'));
  rejected(observed(input), 'move-imports');
});

test('a moved public function can retain its old public name and kind through a reexport', () => {
  const input = fixture();
  replaceFile(input.base, 'src/service.ts', text => text.replace('function helper', 'export function helper'));
  replaceFile(input.head, 'src/service.ts', text => `${text}export { helper } from './service/helper.js';\n`);
  admitted(observed(input));
});

test('renaming an old module public export is rejected', () => {
  const input = fixture();
  replaceFile(input.head, 'src/service.ts', text => text.replace('export function run', 'export function renamed'));
  rejected(observed(input), 'move-exports');
});

test('keeping a public spelling while changing its value/type kind is rejected', () => {
  const input = fixture();
  replaceFile(input.head, 'src/service.ts', () => 'export type run = string;');
  rejected(observed(input), 'move-exports');
});

test('adjacent private constant and function move as one ordered declaration run', () => {
  const constant = '/** Helper prefix. */\nconst prefix = "kept:";';
  const fn = '/** Prefix the value. */\nfunction helper(value) { return prefix + value; }';
  const base = snapshot('base', { 'src/service.ts': `${constant}\n\n${fn}\n\n${run}` });
  const head = snapshot('head', {
    'src/service.ts': `import { helper } from './service/helper.js';\n${run}`,
    'src/service/helper.ts': `${constant}\n\n${fn.replace('function helper', 'export function helper')}`,
  });
  admitted(observed({ base, head }));
});

test('whole ordered units accept a retained inert declaration gap', () => {
  const first = '/** First unit. */\nfunction first() { return 1; }';
  const between = '/** Retained unit. */\nexport function middle() { return 2; }';
  const last = '/** Last unit. */\nfunction last() { return 3; }';
  const base = snapshot('base', { 'src/service.ts': `${first}\n${between}\n${last}` });
  const head = snapshot('head', {
    'src/service.ts': `import { first, last } from './service/units.js';\n${between}`,
    'src/service/units.ts': `${first.replace('function first', 'export function first')}\n${last.replace('function last', 'export function last')}`,
  });
  admitted(observed({ base, head }));
});

test('copied declarations left in the old owner are not reported as a completed move', () => {
  const input = fixture();
  replaceFile(input.head, 'src/service.ts', () => `${originalImport}\n${helper}\n${run}`);
  rejected(observed(input), 'move-residual');
});

test('an extra new eager effect is rejected even if every moved unit matches', () => {
  const input = fixture();
  replaceFile(input.head, 'src/service/helper.ts', text => `${text}\nregister();\n`);
  rejected(observed(input), 'move-residual');
});

test('private exports are not permission to widen an existing public door', () => {
  const input = fixture();
  replaceFile(input.head, 'src/index.ts', text => `${text}\nexport { helper } from './service/helper.js';`);
  rejected(observed(input), 'move-exports');
});

test('a surviving old facade does not make a stale declaration-owner citation valid', () => {
  const input = fixture();
  const note = { path: 'docs/guide.md', text: 'The owner is `src/service.ts` · `helper`.' };
  input.base.files.push({ ...note });
  input.head.files.push({ ...note });
  rejected(observed(input), 'citation-owner');
});

test('a missing current source reference is reported rather than normalized as documentation', () => {
  const input = fixture();
  input.head.files.push({ path: 'docs/guide.md', text: 'Read `src/removed.ts` for the implementation.' });
  rejected(observed(input), 'stale-path');
});

test('updated citations and ancillary documentation remain separately visible', () => {
  const input = fixture();
  input.base.files.push({ path: 'docs/guide.md', text: 'The owner is `src/service.ts` · `helper`.' });
  input.head.files.push({ path: 'docs/guide.md', text: 'The owner is `src/service/helper.ts` · `helper`.' });
  const result = observed(input);
  admitted(result);
  assert.ok(result.ancillaryChanges.some(item => item.path === 'docs/guide.md'), 'missing listed documentation change');
});

test('unresolved dynamic dependency binding stays incomplete rather than equivalent', () => {
  const input = fixture();
  replaceFile(input.base, 'src/service.ts', text => text.replace('convert(value)', 'load(moduleName, value)'));
  replaceFile(input.head, 'src/service/helper.ts', text => text.replace('convert(value)', 'load(moduleName, value)'));
  const result = observed(input);
  assert.equal(result.coverage.complete, false);
  assert.ok(result.coverage.unverified.length > 0, 'missing unsupported binding observation');
});
