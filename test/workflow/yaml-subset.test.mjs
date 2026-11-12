// The strict YAML subset the route workflow tests read with (support/yaml-subset.mjs), and the
// expression evaluator (support/expression.mjs): what each reads, what each refuses, and, where
// Ruby is installed, that the subset reads both workflow files as a real YAML parser does.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { evaluate, parseCondition } from './support/expression.mjs';
import { readWorkflow } from './support/route-workflow.mjs';
import { parseYaml } from './support/yaml-subset.mjs';

test('the subset: mappings, sequences, block scalars, scalars of the core schema, flow {} and [a, b]', () => {
  const doc = parseYaml([
    '# a comment',
    'on:',
    '  workflow_call:',
    'permissions: {}',
    'jobs:',
    '  a:',
    '    needs: [plan, hold]',
    '    timeout-minutes: 10',
    '    steps:',
    '      - name: one # a trailing comment',
    // A ` #` inside a plain scalar starts a comment in YAML, quotes or not; quoted whole, it is text.
    '        if: "${{ x == \'a # b\' }}"',
    "        with: ${{ x == 'a' }} # a comment after a balanced plain scalar",
    '        run: |',
    '          echo "#1"',
    '',
    '          echo two',
    '      - plain',
    "      - 'quoted ''x'''",
    '      - true',
    '',
  ].join('\n'));
  assert.deepEqual(doc, { on: { workflow_call: null }, permissions: {}, jobs: { a: { needs: ['plan', 'hold'], 'timeout-minutes': 10,
    steps: [{ name: 'one', if: "${{ x == 'a # b' }}", with: "${{ x == 'a' }}", run: 'echo "#1"\n\necho two\n' }, 'plain', "quoted 'x'", true] } } });
});

// The second reader's probes (N4): each is read differently by YAML than by a careless reader, so
// the subset refuses it. A workflow line that needs ` #` inside a scalar quotes the whole value.
test('the subset refuses what YAML would read differently: a ` #` inside quotes of a plain scalar, a second space, numbers it does not read, a carriage return, two quoted scalars', () => {
  for (const source of ["a: ${{ x == 'a # b' }}", 'a: say "x # y"', 'a:  b', 'a:  # c', 'a: 22.10', 'a: 0x1F', 'a: 0o17', 'a: 1e3', 'a: .5',
    'a: +1', 'a: 012', 'a: -0', 'a: .inf', 'a: .NaN', 'a: True', 'a: FALSE', 'a: Null', 'a: |\r\n  b\r\n', 'a: b\r\n', "a: 'x' 'y'", 'a: "x" "y"',
    "a: 'x'y", "- 'x' # ok\n- 'y' z"])
    assert.throws(() => parseYaml(source), /yaml-subset/, JSON.stringify(source));
  // A block scalar whose first line is blank takes its indentation from the first line with text.
  assert.deepEqual(parseYaml('a: |\n\n  bc\n    d\n'), { a: '\nbc\n  d\n' });
  // What stays readable: a comment after a quoted scalar, and plain text that only looks numeric.
  assert.deepEqual(parseYaml("a: 'x' # c\nb: 0.13.2\nc: ubuntu-24.04\nd: -1\n"), { a: 'x', b: '0.13.2', c: 'ubuntu-24.04', d: -1 });
});

test('the subset refuses what it does not read', () => {
  for (const source of ['a: &x 1', 'a: *x', 'a: !tag x', 'a: >\n  b', 'a: 1\na: 2', '---\na: 1', 'a:\n\tb: 1', 'a: b: c', '? a\n: b',
    'a:\n- b', 'a: "x\\n"', 'a: [b, [c]]', "a: 'b", 'a: 1\n  b: 2', 'a: |\n'])
    assert.throws(() => parseYaml(source), /yaml-subset/, JSON.stringify(source));
});

test('the subset reads both route workflows as Ruby\'s YAML parser does (where Ruby is installed)', (t) => {
  if (spawnSync('ruby', ['-e', '1']).status !== 0) { t.skip('ruby is not installed'); return; }
  for (const name of ['release-route.yml', 'release-check.yml']) {
    const ruby = spawnSync('ruby', ['-ryaml', '-rjson', '-e', 'puts JSON.generate(YAML.load(File.read(ARGV[0])))', `.github/workflows/${name}`], { encoding: 'utf8' });
    assert.equal(ruby.status, 0, ruby.stderr);
    const theirs = JSON.parse(ruby.stdout);
    // Ruby's parser follows YAML 1.1, where the key `on` is the boolean true; GitHub and the
    // subset read it as the text "on" (YAML 1.2). That one difference is mapped back.
    theirs.on = theirs.true;
    delete theirs.true;
    const sorted = (value) => JSON.stringify(value, (key, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
    assert.equal(sorted(readWorkflow(name).yaml), sorted(theirs), name);
  }
});

test('the evaluator: the few forms, GitHub\'s case-insensitive equality, and a refusal of any other form', () => {
  const world = { cancelled: false, needs: { plan: { result: 'success', outputs: { mode: 'Publish' } }, hold: { result: 'skipped', outputs: {} } } };
  assert.equal(evaluate(parseCondition("${{ !cancelled() && needs.plan.result == 'success' && (needs.hold.result == 'success' || needs.plan.outputs.mode == 'publish') }}"), world), true, 'GitHub compares without letter case');
  assert.equal(evaluate(parseCondition("${{ needs.hold.outputs.mode == '' }}"), world), true, 'a skipped job has no outputs');
  assert.equal(evaluate(parseCondition('${{ !cancelled() }}'), { ...world, cancelled: true }), false);
  assert.throws(() => evaluate(parseCondition("${{ needs.other.result == 'success' }}"), world), /not a job this one needs/);
  for (const condition of ["${{ needs.plan.result != 'success' }}", '${{ always() }}', '${{ success() }}', "${{ contains(needs.plan.outputs.mode, 'p') }}",
    "needs.plan.result == 'success'", "${{ github.ref == 'refs/heads/main' }}", '${{ needs.plan.result }}', "${{ 'a' == needs.plan.result }}", "${{ needs.plan.result == 'Success' }}",
    // N5: GitHub gives `!` a higher precedence than `==` (`!needs.x.result == 'failure'` is `(!'success') == 'failure'`,
    // always false); the evaluator allows `!` only directly before cancelled().
    "${{ !needs.plan.result == 'failure' }}", "${{ !(needs.plan.result == 'success') }}", '${{ !!cancelled() }}', "${{ !cancelled() && !needs.plan.outputs.mode == 'publish' }}"])
    assert.throws(() => parseCondition(condition), Error, condition);
});
