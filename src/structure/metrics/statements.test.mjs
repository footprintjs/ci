import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { parseSource } from '../syntax/parse.mjs';
import { measureSource } from './measure.mjs';
import { countStatements } from './statements.mjs';

function callable(text, name = 'work') {
  const source = parseSource({ path: 'src/example.ts', text });
  const found = [];
  const visit = node => {
    if (ts.isFunctionLike(node) && node.body && node.name?.text === name) found.push(node);
    if (ts.isVariableDeclaration(node) && node.name.text === name && node.initializer && ts.isFunctionLike(node.initializer)
      && node.initializer.body) found.push(node.initializer);
    ts.forEachChild(node, visit);
  };
  visit(source.sourceFile);
  assert.equal(found.length, 1, `missing or ambiguous callable fixture: ${name}`);
  return found[0];
}

function metric(text, name = 'work') {
  const found = measureSource({ path: 'src/example.ts', text }).functions.find(unit => unit.name === name);
  assert.ok(found, `missing function metric: ${name}`);
  return found;
}

for (const text of ['function work(){first();second();third();}',
  'function work(){\n first();\n second();\n third();\n}',
  'function work(){ {first();} {{second();third();}} }']) test('spacing and brace containers preserve statement count', () => {
  assert.equal(countStatements(callable(text)), 3);
});

test('blank comments empty semicolons and statement-looking text are not statements', () => {
  assert.equal(countStatements(callable('function work(){ ;;; /* first(); */ // second();\n }')), 0);
  assert.equal(countStatements(callable('function work(){emit("first();second();");inspect(/[;]/);emit(`third;${"fourth;"}`);}')), 3);
});

test('nested declarations and callback bodies count in the containing block body', () => {
  const before = 'function work(){function child(){first();}listen(()=>{second();});done();}';
  const after = before.replace('second();', 'second();third();fourth();');
  assert.equal(countStatements(callable(before)), 5);
  assert.equal(countStatements(callable(after)), 7);
  assert.equal(countStatements(callable(before, 'child')), 1);
});

test('one variable statement counts once despite multiple declarations or initializers', () => {
  assert.equal(countStatements(callable('function work(){const first=load(),second=inspect();use(first,second);}')), 2);
  assert.equal(countStatements(callable('function work(){let first;var second;}')), 2);
});

test('if loops labels terminals and debugger each follow statement syntax', () => {
  const text = 'function work(){if(ready)return value;else throw failure;for(let i=start();test(i);i=next(i)){use(i);}label:while(active){break label;}do{continue;}while(active);debugger;}';
  assert.equal(countStatements(callable(text)), 11);
});

test('switch cases catch and finally are containers rather than extra statements', () => {
  assert.equal(countStatements(callable('function work(){switch(value){case 1:use();break;default:finish();}}')), 4);
  assert.equal(countStatements(callable('function work(){try{use();}catch(error){recover(error);}finally{finish();}}')), 4);
});

test('TypeScript declaration statements count syntactically even when erased', () => {
  assert.equal(countStatements(callable('function work(){interface Port{read():void}type Name="x";declare function absent():void;use();}')), 4);
});

test('class declaration and nested block bodies count but field expressions are not statements', () => {
  assert.equal(countStatements(callable('function work(){class Store{static field=load();static{initialize();}read(){use();}}}')), 3);
});

test('headers and parameter initializer callbacks stay outside the callable body', () => {
  const text = 'function work(value=()=>{first();second();}){return value;}';
  assert.equal(countStatements(callable(text)), 1);
  const result = measureSource({ path: 'src/example.ts', text });
  const child = result.functions.find(unit => unit.name !== 'work');
  assert.ok(child, 'missing default initializer callback metric');
  assert.equal(child.statementCount, 2);
});

test('concise expression bodies count zero including a contained block callback', () => {
  assert.equal(countStatements(callable('const work=()=>use();')), 0);
  const text = 'const work=()=>listen(()=>{use();});';
  assert.equal(countStatements(callable(text)), 0);
  const result = measureSource({ path: 'src/example.ts', text });
  const child = result.functions.find(unit => unit.name !== 'work');
  assert.ok(child, 'missing nested block callback metric');
  assert.equal(child.statementCount, 1);
});

test('runtime function JSON adds the count without changing existing metrics', () => {
  const compact = metric('function work(){first();second();third();}');
  const spaced = metric('function work(){\n first();\n second();\n third();\n}');
  assert.equal(compact.statementCount, 3); assert.equal(spaced.statementCount, 3);
  assert.equal(compact.codeLines, 1); assert.equal(spaced.codeLines, 5);
  for (const unit of [compact, spaced]) {
    assert.equal(unit.complexity, 1); assert.equal(unit.depth, 0); assert.equal(unit.parameters, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(unit)), unit);
  }
  const [declaration] = measureSource({ path: 'src/example.ts', text: 'class Store{}' }).classes;
  assert.ok(declaration, 'missing class metric');
  assert.equal(Object.hasOwn(declaration, 'statementCount'), false);
});
