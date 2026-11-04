import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { unitIdentity, runtimeCallable, runtimeClass } from './identity.mjs';

test('same-spelled methods have distinct owners and shrink-stable identity', () => {
  const parsed = parseSource({ path: 'src/a.ts', text: 'class First { read() { use(); } } class Second { read() {} }' });
  const first = unitIdentity(parsed.sourceFile.statements[0].members[0], parsed);
  const second = unitIdentity(parsed.sourceFile.statements[1].members[0], parsed);
  assert.notEqual(first.identity, second.identity);
  const shrunk = parseSource({ path: 'src/moved.ts', text: 'class First { read() {} }' });
  assert.equal(first.identity, unitIdentity(shrunk.sourceFile.statements[0].members[0], shrunk).identity);
  assert.notEqual(first.bodyHash, unitIdentity(shrunk.sourceFile.statements[0].members[0], shrunk).bodyHash);
});

test('a signature with no runtime body is excluded', () => {
  const parsed = parseSource({ path: 'src/a.ts', text: 'declare function absent(): void; function present() {}' });
  assert.equal(runtimeCallable(parsed.sourceFile.statements[0]), false);
  assert.equal(runtimeCallable(parsed.sourceFile.statements[1]), true);
});

test('class-field arrows retain their declared property and class owner', () => {
  const parsed = parseSource({ path: 'src/a.ts', text: 'class Store { onEvent = () => {}; } class Other { onEvent = () => {}; }' });
  const first = unitIdentity(parsed.sourceFile.statements[0].members[0].initializer, parsed);
  const second = unitIdentity(parsed.sourceFile.statements[1].members[0].initializer, parsed);
  assert.equal(first.name, 'onEvent');
  assert.equal(first.identity, 'arrow:Store.onEvent');
  assert.notEqual(first.identity, second.identity);
});

test('ambient classes do not represent emitted runtime units', () => {
  const parsed = parseSource({ path: 'src/a.ts', text: 'declare class Port {} declare namespace Types { class Inner {} } class Runtime {}' });
  assert.equal(runtimeClass(parsed.sourceFile.statements[0]), false);
  assert.equal(runtimeClass(parsed.sourceFile.statements[1].body.statements[0]), false);
  assert.equal(runtimeClass(parsed.sourceFile.statements[2]), true);
  const declaration = parseSource({ path: 'src/a.d.ts', text: 'class Port {}' });
  assert.equal(runtimeClass(declaration.sourceFile.statements[0]), false);
});
