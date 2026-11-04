import assert from 'node:assert/strict';
import test from 'node:test';
import { observeSnapshot } from './snapshot.mjs';

test('candidate text is measured as data and the supplied tracked snapshot stays unchanged', () => {
  const input = { id: 'data', files: [{ path: 'src/leaf.ts', text: 'throw new Error("must not execute");' }] };
  const before = JSON.stringify(input);
  const result = observeSnapshot(input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(result.id, 'data');
  assert.equal(result.measurements[0].path, 'src/leaf.ts');
});

test('tracked input ordering does not change the snapshot observation', () => {
  const files = [{ path: 'src/b.ts', text: 'export const second = 2;' },
    { path: 'docs/guide.md', text: 'See `src/a.ts`.' }, { path: 'src/a.ts', text: 'export const first = 1;' }];
  assert.deepEqual(observeSnapshot({ files }), observeSnapshot({ files: [...files].reverse() }));
});
