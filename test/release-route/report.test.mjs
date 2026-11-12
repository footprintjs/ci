import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReport, safeLine } from '../../src/release-route/report.mjs';
import { Refusal } from '../../src/release-route/refusals.mjs';

function capture(env = { GITHUB_OUTPUT: '/out', GITHUB_STEP_SUMMARY: '/summary' }) {
  const printed = [];
  const files = {};
  const report = createReport({ env, print: (line) => printed.push(line), append: (path, text) => { files[path] = (files[path] ?? '') + text; } });
  return { report, printed, files };
}

test('lines go to the log and, escaped inside <pre>, to the job summary', () => {
  const { report, printed, files } = capture();
  report.say('Plan: publish 0.13.2');
  report.say('Title: <img src=x> & ![a](b)');
  report.summary();
  assert.deepEqual(printed, ['Plan: publish 0.13.2', 'Title: <img src=x> & ![a](b)']);
  assert.equal(files['/summary'], '<pre>\nPlan: publish 0.13.2\nTitle: &lt;img src=x&gt; &amp; ![a](b)\n</pre>\n');
});

test('a line never starts with untrusted text and never holds a workflow command', () => {
  assert.equal(safeLine('::error::x'), 'Note: : :error: :x');
  assert.equal(safeLine('  ##[warning]x'), 'Note: # #[warning]x');
  assert.equal(safeLine('Fixed: a\nb'), 'Fixed: a b');
});

test('outputs are written only from their closed alphabets', () => {
  const { report, files } = capture();
  report.output('mode', 'publish');
  report.output('commit', 'c94c2a6fed62378c428df22d316d36f576511d6a');
  report.output('version', '0.13.1');
  report.output('package', '@footprintjs/release-flow');
  report.output('compare', 'no');
  report.output('rule', 'released');
  report.output('file', 'package.tgz');
  assert.equal(files['/out'], 'mode=publish\ncommit=c94c2a6fed62378c428df22d316d36f576511d6a\nversion=0.13.1\npackage=@footprintjs/release-flow\ncompare=no\nrule=released\nfile=package.tgz\n');
  for (const [key, value] of [['mode', 'ship'], ['version', '1.0.0\nmode=publish'], ['commit', 'HEAD'], ['title', 'x'], ['file', '../x.tgz'], ['package', 'A'], ['rule', 'x'], ['mode', 1]])
    assert.throws(() => report.output(key, value), (error) => error instanceof Refusal && error.code === 'output-invalid');
});

test('without the runner files nothing is appended', () => {
  const { report, files } = capture({});
  report.say('Plan: nothing');
  report.output('mode', 'nothing');
  report.summary();
  assert.deepEqual(files, {});
});
