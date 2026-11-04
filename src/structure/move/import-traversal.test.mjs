import assert from 'node:assert/strict';
import test from 'node:test';
import { importOrderCoverage } from './imports.mjs';
import { moveContext } from './context.mjs';
import { snapshot } from './testing.fixture.mjs';

function diamond(layers) {
  const files = { 'src/leaf.ts': 'export const ready=initialize();' };
  let previous = ['leaf'];
  for (let layer = 0; layer < layers; layer++) {
    const current = [`left${layer}`, `right${layer}`];
    for (const name of current) files[`src/${name}.ts`] = previous.map(name => `import './${name}.js';`).join('\n');
    previous = current;
  }
  return moveContext(snapshot(files));
}

test('shared eager dependencies are visited once per root, not once per import path', () => {
  const base = diamond(6), head = diamond(6);
  let visits = 0;
  for (const context of [base, head]) {
    const get = context.parsed.get.bind(context.parsed);
    context.parsed.get = path => { visits++; return get(path); };
  }
  assert.deepEqual(importOrderCoverage(base, head, new Map()), []);
  const roots = base.parsed.size;
  assert.ok(visits >= roots * 2);
  assert.ok(visits <= roots * roots * 2, `Expected bounded module visits, received ${visits}`);
});

test('an active eager cycle remains unknown for every affected root', () => {
  const files = { 'src/left.ts': "import './right.js';", 'src/right.ts': "import './left.js';" };
  const result = importOrderCoverage(moveContext(snapshot(files)), moveContext(snapshot(files)), new Map());
  for (const path of Object.keys(files)) assert.ok(result.some(item => item.path === path && item.reason.includes('Cyclic')));
});

test('first-visit ordering still detects reordered load-bearing owners', () => {
  const files = { 'src/start.ts': "import './left.js'; import './right.js';",
    'src/left.ts': 'const left=initialize();', 'src/right.ts': 'const right=initialize();' };
  const base = moveContext(snapshot(files));
  const head = moveContext(snapshot({ ...files, 'src/start.ts': "import './right.js'; import './left.js';" }));
  const result = importOrderCoverage(base, head, new Map());
  assert.ok(result.some(item => item.path === 'src/start.ts' && item.reason.includes('order changed')));
});
