import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('reusable release workflow is structurally shadow-only, has no privileged installer/publisher or target checkout', async () => {
  const source = await readFile('.github/workflows/release.yml','utf8');
  assert.match(source, /workflow_call:/); assert.match(source, /default: shadow/); assert.match(source, /test "\$MODE" = shadow/);
  assert.match(source, /repository: footprintjs\/ci/); assert.match(source, /ref: \$\{\{ inputs.tool_sha \}\}/);
  assert.match(source, /persist-credentials: false/); assert.match(source, /test "\$SOURCE_SHA" = "\$CALLER_SHA"/);
  assert.match(source, /retention-days: 90/); assert.equal((source.match(/if: always\(\)/g) ?? []).length, 2);
  assert(!/id-token|contents: write|pull-requests: write|secrets:|npm (?:ci|install|publish)|npx|release-app|PRIVATE_KEY/.test(source));
  for (const ref of source.matchAll(/uses: ([^\s]+)/g)) assert.match(ref[1], /@[a-f0-9]{40}$/);
  assert.match(source, /GH_TOKEN: \$\{\{ github.token \}\}/);
});
test('ordinary checks rebuild and reject uncommitted bundle drift on both required runtimes', async () => {
  const source = await readFile('.github/workflows/check.yml','utf8');
  assert.match(source, /node: \[22, 24\]/); assert.match(source, /npm ci --ignore-scripts/);
  assert.match(source, /npm test/); assert.match(source, /npm run build/);
  assert.match(source, /git diff --exit-code -- dist\/release.cjs dist\/build-metadata.json/);
});
test('prebuilt metadata closes runtime imports and contains approved cohort dependencies', async () => {
  const meta = JSON.parse(await readFile('dist/build-metadata.json','utf8'));
  assert(meta.external.every((name) => name.startsWith('node:')));
  for (const name of ['footprintjs','foottrace']) assert(meta.inputs.some((item) => item.path.startsWith('node_modules/'+name+'/')));
  assert(meta.inputs.some((item) => item.path === 'configs/foottrace.json'));
  assert(meta.inputs.some((item) => item.path === 'src/guards/release-github.cjs'));
});
