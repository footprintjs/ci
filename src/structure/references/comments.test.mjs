import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceComments } from './comments.mjs';
import { parseSource } from '../syntax/parse.mjs';

test('comment-looking JSX and string text cannot become live source comments', () => {
  const parsed = parseSource({ path: 'src/view.tsx', text: 'const sample = "// src/data.ts"; const View = () => <p>// src/jsx-data.ts</p>; // src/real.ts' });
  const text = sourceComments(parsed).map(item => item.text).join('\n');
  assert.ok(text.includes('src/real.ts'));
  assert.ok(!text.includes('src/data.ts'));
  assert.ok(!text.includes('src/jsx-data.ts'));
});
