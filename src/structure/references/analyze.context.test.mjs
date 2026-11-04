import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSnapshots } from '../check/report.mjs';

function report(files) {
  return checkSnapshots({ files: Object.entries(files).map(([path, text]) => ({ path, text })) });
}

test('a unique shorthand citation still checks the real declaration owner', () => {
  const files = { 'src/core/tools/tool.ts': 'export function work() {}',
    'docs/guide.md': 'Owner: `tools/tool.ts` · `work`.' };
  assert.deepEqual(report(files).findings, []);
  files['src/core/tools/tool.ts'] = 'export function another() {}';
  const findings = report(files).findings;
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'citation-owner');
});

test('nested package context is reported as uncertainty without a stale-path accusation', () => {
  const result = report({ 'docs-site/package.json': '{}', 'docs-site/src/env.d.ts': 'interface Env {}',
    'docs-site/checks/README.md': 'See `src/env.d.ts`.' });
  assert.deepEqual(result.findings, []);
  assert.ok(result.coverage.unverified.some(item => /nested package/.test(item.reason)));
});
