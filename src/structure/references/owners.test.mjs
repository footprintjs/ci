import assert from 'node:assert/strict';
import test from 'node:test';
import { declarationOwners, symbolOwner } from './owners.mjs';
import { parseSource } from '../syntax/parse.mjs';

test('forwarded bindings are distinct from real qualified member declarations', () => {
  const parsed = parseSource({ path: 'src/a.ts', text: "import { work } from './real.js'; export { work }; export class Runner { constructor() {} run() {} }" });
  const result = declarationOwners(parsed);
  assert.ok(!result.names.has('work'));
  assert.ok(result.names.has('Runner.run'));
  assert.ok(result.names.has('Runner.constructor'));
});

test('a unique nested declaration can be cited by name while ambiguous members stay unknown', () => {
  const parsed = parseSource({ path: 'src/a.ts', text: 'function outer() { function helper() {} } class First { run() {} } class Second { run() {} }' });
  const owners = declarationOwners(parsed);
  assert.equal(symbolOwner(owners, 'helper'), 'present');
  assert.equal(symbolOwner(owners, 'run'), 'unverified');
  assert.equal(symbolOwner(owners, 'First.run'), 'present');
});
