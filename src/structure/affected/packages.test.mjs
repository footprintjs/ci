import assert from 'node:assert/strict';
import test from 'node:test';
import { packageOwnership } from './packages.mjs';

test('declared dependencies and tracked package names remain distinct evidence', () => {
  const result = packageOwnership(new Map([
    ['package.json', { text: '{"name":"root","dependencies":{"published":"1","workspace":"*"}}' }],
    ['packages/owner/package.json', { text: '{"name":"workspace"}' }],
  ]));
  assert.deepEqual([...result.packages], ['published', 'workspace']);
  assert.deepEqual([...result.sourcePackages], ['root', 'workspace']);
  assert.equal(result.unknownSourcePackages, false);
});

test('malformed nested fixture data is uncertainty while malformed root input remains an error', () => {
  const result = packageOwnership(new Map([['test/fixtures/package.json', { text: 'null' }]]));
  assert.equal(result.unknownSourcePackages, true);
  assert.ok(result.unverified.some(item => item.path === 'test/fixtures/package.json'));
  assert.throws(() => packageOwnership(new Map([['package.json', { text: '{ invalid' }]])), SyntaxError);
  assert.throws(() => packageOwnership(new Map([['package.json', { text: 'null' }]])), TypeError);
  assert.throws(() => packageOwnership(new Map([['package.json', { text: '' }]])), SyntaxError);
  assert.equal(packageOwnership(new Map()).unknownSourcePackages, false);
});
