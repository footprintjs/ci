import assert from 'node:assert/strict';
import test from 'node:test';
import { snapshotContext } from './context.mjs';

test('parse diagnostics are data while candidate code is never evaluated', () => {
  const result = snapshotContext({ files: [{ path: 'src/a.ts', text: 'throw new Error("never run"); function broken( {' }] });
  assert.ok(result.unverified.some(item => item.kind === 'parse-error' && item.path === 'src/a.ts'));
});

test('missing runner config keeps suffix candidates known and discovery uncertainty explicit', () => {
  const result = snapshotContext({ files: [{ path: 'src/a.test.ts', text: '' }, { path: 'test/custom.ts', text: '' },
    { path: 'test/helpers/factory.ts', text: '' }] });
  assert.deepEqual(result.tests, ['src/a.test.ts']);
  assert.ok(result.unverified.some(item => item.kind === 'affected-test-discovery'));
});

test('root self imports and tracked package names override declared external ownership', () => {
  const result = snapshotContext({ files: [
    { path: 'package.json', text: '{"name":"self","dependencies":{"self":"*","@scope/workspace":"*","published":"1.0.0"}}' },
    { path: 'packages/workspace/package.json', text: '{"name":"@scope/workspace"}' },
    { path: 'src/owner.ts', text: "import 'self'; import '@scope/workspace/subpath'; import 'published'; import 'node:fs';" },
  ] });
  const requests = result.modules.get('src/owner.ts')?.requests;
  assert.ok(Array.isArray(requests), 'missing module requests');
  assert.ok(requests[0].reason, 'self import cannot be proven external');
  assert.ok(requests[1].reason, 'tracked workspace owner cannot be proven external');
  assert.equal(requests[2].external, true);
  assert.equal(requests[3].external, true);
});

for (const text of ['{ malformed', 'null', '']) {
  test(`unreadable nested package metadata remains explicit uncertainty: ${text}`, () => {
    let result;
    assert.doesNotThrow(() => { result = snapshotContext({ files: [
      { path: 'package.json', text: '{"dependencies":{"published":"1"}}' },
      { path: 'test/fixtures/package.json', text },
      { path: 'src/owner.ts', text: "import 'published'; import 'node:fs';" },
    ] }); });
    assert.ok(result?.unverified.some(item => item.kind === 'affected-package' && item.path === 'test/fixtures/package.json'));
    const requests = result.modules.get('src/owner.ts')?.requests;
    assert.ok(requests?.[0].reason, 'unknown package names cannot prove a bare import external');
    assert.equal(requests[1].external, true);
  });
}
