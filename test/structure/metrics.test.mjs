import assert from 'node:assert/strict';
import test from 'node:test';
import { measureParsed, measureSource } from '../../src/structure/metrics/measure.mjs';
import { parseSource } from '../../src/structure/syntax/parse.mjs';

const measure = text => measureSource({ path: 'src/example.ts', text });
const named = (result, name) => {
  const found = result.functions.find(unit => unit.name === name);
  assert.ok(found, `missing function metric: ${name}`);
  return found;
};
const firstUnit = (units, label) => {
  assert.ok(units[0], `missing ${label} metric`);
  return units[0];
};

test('empty source is a JSON-only observation', () => {
  const result = measure('');
  assert.deepEqual(result, { path: 'src/example.ts', physicalLines: 0, codeLines: 0,
    functions: [], classes: [], topLevelLets: [], exports: [], diagnostics: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test('physical lines include comments and an unterminated last line', () => {
  assert.equal(measure('// comment\n\nconst value = 1;').physicalLines, 3);
  assert.equal(measure('// comment\n\nconst value = 1;\n').physicalLines, 3);
  assert.equal(measure('// comment\n\nconst value = 1;').codeLines, 1);
});

test('token lines distinguish comments from string, template and regex content', () => {
  const text = ['/** only docs */', 'const url = "https://example.test/*x*/";',
    '/* only a block', '   still a comment */', 'const pattern = /[/][/]/;',
    'const template = `first', '// string content', '/* string content */', '`;', ''].join('\n');
  assert.equal(measure(text).codeLines, 6);
});

test('nested functions count in outer lines but not outer branches or depth', () => {
  const text = ['function outer() {', '  function inner() {', '    if (ready) {',
    '      while (active) { work(); }', '    }', '  }', '  return inner;', '}'].join('\n');
  const result = measure(text);
  assert.equal(named(result, 'outer').codeLines, 8);
  assert.equal(named(result, 'outer').complexity, 1);
  assert.equal(named(result, 'outer').depth, 0);
  assert.equal(named(result, 'inner').complexity, 3);
  assert.equal(named(result, 'inner').depth, 2);
});

test('function code-line equality and the next line are measured exactly', () => {
  const source = count => ['function work() {', ...Array(count - 2).fill('  use();'), '}'].join('\n');
  assert.equal(named(measure(source(60)), 'work').codeLines, 60);
  assert.equal(named(measure(source(61)), 'work').codeLines, 61);
});

test('file physical and code boundaries remain separate', () => {
  const source = count => `${Array(count).fill('use();').join('\n')}\n`;
  assert.equal(measure(source(300)).codeLines, 300);
  assert.equal(measure(source(301)).codeLines, 301);
  assert.equal(measure(source(600)).physicalLines, 600);
  assert.equal(measure(source(601)).physicalLines, 601);
});

test('complexity equality and the next branch are measured exactly', () => {
  const source = count => `function work() { ${Array(count).fill('if (ready) use();').join(' ')} }`;
  assert.equal(named(measure(source(14)), 'work').complexity, 15);
  assert.equal(named(measure(source(15)), 'work').complexity, 16);
});

test('all declared decision operators contribute, default and optional access do not', () => {
  const text = `function work() {
    if (a) use(); while (a) use(); for (;;) use(); do use(); while (a);
    for (const item of items) use(item); for (const key in object) use(key);
    switch (a) { case 1: break; default: break; }
    try { use(); } catch { use(); }
    const value = a ? b : c; const other = a && b || c ?? d;
    return object?.field;
  }`;
  assert.equal(named(measure(text), 'work').complexity, 13);
});

test('else-if shares its branch depth; try catch and finally are sibling bodies', () => {
  const text = `function work() {
    if (a) use(); else if (b) use(); else use();
    try { if (a) use(); } catch { if (b) use(); } finally { if (c) use(); }
  }`;
  assert.equal(named(measure(text), 'work').depth, 2);
  assert.equal(named(measure('function work() { if (a) use(); else if (b) use(); }'), 'work').depth, 1);
});

test('depth equality and the next nested branch are measured exactly', () => {
  const source = count => `function work() { ${'if (ready) { '.repeat(count)}use();${'}'.repeat(count)} }`;
  assert.equal(named(measure(source(4)), 'work').depth, 4);
  assert.equal(named(measure(source(5)), 'work').depth, 5);
});

test('optional default destructured and rest parameters count once; TS this does not', () => {
  const result = measure('function work(this: Context, first?: string, second = 1, { value } = {}, ...rest: string[]) {}');
  assert.equal(named(result, 'work').parameters, 4);
});

test('runtime bodies alone are functions and methods have inferred names', () => {
  const result = measure(`declare function absent(value: string): void;
    function overload(value: string): void;
    function overload(value: string) {}
    const assigned = () => 1;
    const holder = { read() { return 1; }, nested: function () {} };
    class Store { constructor() {} get value() { return 1; } set value(next: number) {} }`);
  assert.equal(result.functions.length, 7);
  for (const name of ['overload', 'assigned', 'read', 'nested', 'constructor', 'value']) {
    assert.ok(named(result, name), name);
  }
});

test('JSX eligibility requires PascalCase and own return JSX', () => {
  const result = measureSource({ path: 'src/view.tsx', text: `
    const View = () => <div title="// literal">{/* comment */}text</div>;
    const lower = () => <span />;
    function Wrapper() { function Child() { return <p />; } return null; }
  ` });
  assert.equal(named(result, 'View').jsx, true);
  assert.equal(named(result, 'lower').jsx, false);
  assert.equal(named(result, 'Wrapper').jsx, false);
  assert.equal(named(result, 'Child').jsx, true);
  assert.deepEqual(result.diagnostics, []);
});

test('only direct SourceFile let declarations are module state', () => {
  const result = measure('let first = 1, second = 2; const stable = 1; var old = 1; function work() { let local = 1; }');
  assert.deepEqual(result.topLevelLets, [{ name: 'first', line: 1 }, { name: 'second', line: 1 }]);
});

test('classes include nested code and exact class equality remains observable', () => {
  const source = count => ['class Store {', '  work() {', ...Array(count - 4).fill('    use();'), '  }', '}'].join('\n');
  assert.equal(firstUnit(measure(source(300)).classes, 'class').codeLines, 300);
  assert.equal(firstUnit(measure(source(301)).classes, 'class').codeLines, 301);
});

test('exports retain public syntax names including aliases and type-only exports', () => {
  const result = measure('export const publicValue = 1; export type Shape = {}; export { publicValue as renamed }; export type { Other } from "./other.js"; export * from "./all.js";');
  assert.deepEqual(result.exports.map(entry => entry.name), ['publicValue', 'Shape', 'renamed', 'Other', '*']);
});

test('named identity survives movement and shrink; anonymous identity follows tokens', () => {
  const before = named(measure('function work() { use(); use(); }'), 'work');
  const after = named(measureSource({ path: 'src/moved.ts', text: '\nfunction work() { use(); }' }), 'work');
  assert.equal(before.identity, after.identity);
  assert.notEqual(before.bodyHash, after.bodyHash);
  const anonymous = text => firstUnit(measure(text).functions, 'anonymous function');
  assert.equal(anonymous('consume(() => use());').identity, anonymous('\nconsume( () => use() );').identity);
  assert.notEqual(anonymous('consume(() => use());').identity, anonymous('consume(() => change());').identity);
});

test('method identities retain owner names to distinguish sibling methods', () => {
  const result = measure('class First { read() {} } class Second { read() {} }');
  const reads = result.functions.filter(unit => unit.name === 'read');
  assert.equal(reads.length, 2);
  assert.notEqual(reads[0].identity, reads[1].identity);
  assert.equal(typeof reads[0].bodyHash, 'string');
});

test('parsed snapshots are reusable and public metrics expose offsets without AST objects', () => {
  const parsed = parseSource({ path: 'src/example.ts', text: '// docs\nfunction work() {}' });
  const result = measureParsed(parsed);
  const unit = named(result, 'work');
  assert.ok(parsed.sourceFile);
  assert.ok(parsed.codeLineSet instanceof Set);
  assert.equal(parsed.text.slice(unit.start, unit.end), 'function work() {}');
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test('syntax diagnostics are data and never execute candidate text', () => {
  const result = measure('throw new Error("not evaluated"); function broken( {');
  assert.ok(result.diagnostics.length > 0);
  assert.equal(typeof result.diagnostics[0].line, 'number');
  assert.equal(typeof result.diagnostics[0].code, 'number');
  assert.equal(typeof result.diagnostics[0].message, 'string');
});
