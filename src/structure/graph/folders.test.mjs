import assert from 'node:assert/strict';
import test from 'node:test';
import { folderFindings } from './folders.mjs';

test('deep siblings and exterior sealed consumers are distinct structural findings', () => {
  const edges = [{ from: 'src/team/left/deep/a.ts', to: 'src/team/right/b.ts', line: 1 },
    { from: 'src/team/right/b.ts', to: 'src/team/left/deep/a.ts', line: 1 }];
  const result = folderFindings(edges, [{ facade: 'src/team/Right.ts', folder: 'src/team/right/' }]);
  assert.deepEqual(result.findings.map(item => item.rule).sort(), ['mutual-siblings', 'sealed-folder']);
  assert.deepEqual(result.mutualSiblingPairs[0].folders, ['src/team/left', 'src/team/right']);
});
