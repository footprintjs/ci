// docs/RELEASE-ROUTE.md shows the facts, the rule table and every refusal as the code has them;
// this test rebuilds those tables from the code and fails when the doc has drifted.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { REFUSALS } from '../../src/release-route/refusals.mjs';
import { FACTS, RULES } from '../../src/release-route/rules.mjs';

const doc = readFileSync('docs/RELEASE-ROUTE.md', 'utf8');

test('the doc holds the facts table, the rule table and the refusal table exactly as the code has them', () => {
  const facts = ['| Fact | Values |', '|---|---|', ...Object.entries(FACTS).map(([name, values]) => `| \`${name}\` | ${values.join(', ')} |`)];
  const rules = ['| # | Rule (the printed reason) | When (all must hold) | Result |', '|---|---|---|---|',
    ...RULES.map((rule, i) => `| ${i + 1} | \`${rule.id}\` | ${Object.entries(rule.when).map(([k, v]) => `${k} = ${v}`).join(', ')} | ${
      rule.refuse ? `refuse \`${rule.refuse}\`` : `**${rule.mode}** (compare with npm: ${rule.compare})`} |`)];
  const codes = ['| Code | Sentence |', '|---|---|', ...Object.entries(REFUSALS).map(([code, sentence]) => `| \`${code}\` | ${sentence} |`)];
  for (const table of [facts, rules, codes]) assert.ok(doc.includes(table.join('\n')), `${table[0]} table differs from the code`);
});
