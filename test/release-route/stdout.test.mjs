// The entry points' printer (stdout.mjs · stdoutPrinter), with a stream the test hands in: a
// failed write makes `print` throw at once, so a step whose stdout closed refuses before its end
// and writes no output; the stream's later 'error' event ends the process with exit 1.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { createReport } from '../../src/release-route/report.mjs';
import { runHandlers } from '../../src/release-route/step-common.mjs';
import { stdoutPrinter } from '../../src/release-route/stdout.mjs';

// A stream whose reader goes away after `open` writes.
function stream(open) {
  const fake = new EventEmitter();
  fake.written = [];
  fake.errored = null;
  fake.write = (text) => {
    if (fake.written.length >= open) fake.errored = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
    else fake.written.push(text);
    return true;
  };
  return fake;
}

test('lines go out masked; a closed stdout makes print throw, and its error event exits 1', () => {
  const out = stream(1);
  const exits = [];
  const print = stdoutPrinter({ env: { GITHUB_TOKEN: 'ghs_secretsecret' }, stream: out, exit: (code) => exits.push(code) });
  print('Detail: ghs_secretsecret');
  assert.deepEqual(out.written, ['Detail: ***\n']);
  assert.throws(() => print('Decision: …'), /stdout is closed/);
  out.emit('error', out.errored);
  assert.deepEqual(exits, [1]);
});

test('a step whose stdout closes before its end exits 1 and writes no output', async () => {
  const files = {};
  const print = stdoutPrinter({ stream: stream(1), exit: () => {} });
  const report = createReport({ env: { GITHUB_OUTPUT: 'out', GITHUB_STEP_SUMMARY: 'summary' }, print, append: (path, text) => { files[path] = text; }, appendOutputs: (path, text) => { files[path] = text; } });
  const code = await runHandlers({ plan: () => {
    report.say('Release route plan.');
    report.output('rule', 'publish');
    report.output('mode', 'publish');
    report.say('Decision: rule publish gives mode publish.');
  } }, 'plan', { report });
  assert.equal(code, 1);
  assert.deepEqual(files, {});
});
