// The charted plan against the plain one, on the family as it is today and on the ways it can
// go wrong: the same facts, the same causes, the same context and the same decision.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runPlanChart } from '../../../src/release-route/chart/plan-run.mjs';
import { observe } from '../../../src/release-route/observe.mjs';
import { plan } from '../../../src/release-route/plan.mjs';
import { asRefusal } from '../../../src/release-route/refusals.mjs';
import { FILES, storydeckDoors } from '../storydeck-today.mjs';

const causes = (found) => Object.fromEntries(Object.entries(found).map(([name, refusal]) => [name, `${refusal.code} ${refusal.detail}`]));
const nulls = (facts) => Object.fromEntries(Object.entries(facts).map(([name, value]) => [name, value === undefined ? null : value]));

async function both(options) {
  const plain = await observe(storydeckDoors(options)).then((observed) => ({ ...observed, result: plan({ facts: observed.facts }) }),
    (error) => ({ failure: asRefusal(error).code }));
  const chart = await runPlanChart(storydeckDoors(options));
  return { plain, chart };
}

const bumped = (version, head) => ({ ...FILES,
  'package.json': Buffer.from(FILES['package.json'].toString().replace('"version": "0.13.1"', `"version": "${version}"`)),
  'CHANGELOG.md': Buffer.from(FILES['CHANGELOG.md'].toString().replace('# Changelog\n', `# Changelog\n${head}`)) });
const noSettings = { ...FILES };
delete noSettings['.github/release.json'];

for (const [label, options] of [
  ['storydeck 0.13.1 on main today', {}],
  ['a dry run from a branch', { extra: { ROUTE_ACTION: 'dry-run', GITHUB_REF: 'refs/heads/x' } }],
  ['0.13.2 with its section, no tag: publish', { files: bumped('0.13.2', '\n## 0.13.2 \u{2014} a test\n\n- x\n'), lsRemote: '' }],
  ['0.13.2 off main', { files: bumped('0.13.2', '\n## 0.13.2 \u{2014} a test\n\n- x\n'), lsRemote: '', extra: { GITHUB_REF: 'refs/heads/x' } }],
  ['an old commit of main, npm has the version, no tag', { lsRemote: '', mainTip: 'f'.repeat(40) }],
  ['no settings file', { files: noSettings }],
  ['npm answers 503', { routes: { 'https://registry.npmjs.org/footprint-storydeck': () => new Response('{}', { status: 503 }) } }],
  ['the tool commit is not plain', { extra: { ROUTE_TOOL_SHA: 'main' } }],
  ['an odd action', { extra: { ROUTE_ACTION: 'prepare\u{202E}::x' } }],
  // The second reader's four: each looks like an allowed action once cleaned, and is not one.
  ['"publish " (a trailing space)', { extra: { ROUTE_ACTION: 'publish ' } }],
  ['"publish" + a zero-width space', { extra: { ROUTE_ACTION: 'publish\u{200B}' } }],
  ['"\\tpublish\\n"', { extra: { ROUTE_ACTION: '\tpublish\n' } }],
  ['"dry-run" + a direction mark', { extra: { ROUTE_ACTION: 'dry-run\u{202E}' } }],
])
  test(`chart and plain agree: ${label}`, async () => {
    const { plain, chart } = await both(options);
    assert.equal(chart.run.failure, null);
    // Every fact, the action included, is exactly what the plain path decides on.
    assert.deepEqual(chart.result, plain.result);
    assert.deepEqual(nulls(chart.facts), { ...Object.fromEntries(Object.keys(chart.facts).map((n) => [n, null])), ...nulls(plain.facts) });
    assert.deepEqual(causes(chart.causes), causes(plain.causes));
    // The context the plan step reads back (step-common.mjs · reportPlan): the plain one but its
    // changelog style, which only the changelog look reads, inside the chart.
    const { changelogStyle, ...reported } = plain.context;
    assert.deepEqual(chart.context, reported);
  });

test('a malformed GITHUB_SHA stops the charted run as it stops the plain one (input-invalid)', async () => {
  const { plain, chart } = await both({ extra: { GITHUB_SHA: 'main' } });
  assert.equal(plain.failure, 'input-invalid');
  assert.equal(asRefusal(chart.run.failure.error).code, 'input-invalid');
  assert.equal(chart.result, null);
});
