// How a plan step ENDS, on both paths (the plain step, command.mjs, and the charted step, chart/),
// in this process with the real file writer or a writer the test hands in: a step that exits 1
// never leaves `mode` or `compare` in GITHUB_OUTPUT, whichever write fails (report.mjs · end).
// The same cases through the committed bundle and the plain script: step-end-bundle.test.mjs.
import assert from 'node:assert/strict';
import { appendFileSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { runChartStep } from '../../../src/release-route/chart/cli.mjs';
import { runStep } from '../../../src/release-route/command.mjs';
import { createReport } from '../../../src/release-route/report.mjs';
import { FILES, storydeckDoors } from '../storydeck-today.mjs';

// storydeck 0.13.2 with its section and no tag, on main: the plan says mode=publish, compare=yes.
const PUBLISH = { lsRemote: '', files: { ...FILES,
  'package.json': Buffer.from(FILES['package.json'].toString().replace('"version": "0.13.1"', '"version": "0.13.2"')),
  'CHANGELOG.md': Buffer.from(FILES['CHANGELOG.md'].toString().replace('# Changelog\n', '# Changelog\n\n## 0.13.2 \u{2014} t\n\n- x\n')) } };
const PATHS = { plain: runStep, chart: runChartStep };
const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;

const folder = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'route-end-'));
  t.after(() => { chmodSync(dir, 0o700); rmSync(dir, { recursive: true, force: true }); });
  return dir;
};
const read = (path) => { try { return statSync(path).isFile() ? readFileSync(path, 'utf8') : '<not a file>'; } catch { return '<none>'; } };

async function plan(runner, env, append = appendFileSync) {
  const printed = [];
  const report = createReport({ env, print: (line) => printed.push(line), append });
  const code = await runner('plan', { ...storydeckDoors(PUBLISH), report, sleep: async () => {}, argv: [] });
  return { code, printed };
}

for (const [path, runner] of Object.entries(PATHS)) {
  test(`${path}: the pass writes the four names, compare, and mode as the last line`, async (t) => {
    const dir = folder(t);
    const env = { GITHUB_OUTPUT: join(dir, 'out'), GITHUB_STEP_SUMMARY: join(dir, 'summary') };
    const result = await plan(runner, env);
    assert.equal(result.code, 0, result.printed.join('\n'));
    assert.match(read(env.GITHUB_OUTPUT), /^rule=publish\ncommit=[0-9a-f]{40}\npackage=footprint-storydeck\nversion=0\.13\.2\ncompare=yes\nmode=publish\n$/);
  });

  const SUMMARY_FAILS = {
    'a folder': (dir) => { mkdirSync(join(dir, 'summary')); return join(dir, 'summary'); },
    'a read-only file': (dir) => { writeFileSync(join(dir, 'summary'), ''); chmodSync(join(dir, 'summary'), 0o400); return join(dir, 'summary'); },
    'under a missing folder': (dir) => join(dir, 'missing', 'summary'),
  };
  for (const [label, make] of Object.entries(SUMMARY_FAILS))
    test(`${path}: the summary path is ${label}: exit 1, and GITHUB_OUTPUT holds nothing`, { skip: asRoot && label === 'a read-only file' }, async (t) => {
      const dir = folder(t);
      const env = { GITHUB_OUTPUT: join(dir, 'out'), GITHUB_STEP_SUMMARY: make(dir) };
      const result = await plan(runner, env);
      assert.equal(result.code, 1);
      assert.equal(read(env.GITHUB_OUTPUT), '<none>', 'an output was written although the step exits 1');
      assert.match(result.printed.at(-1), /^Refused: unexpected-failure\./, 'the refusal is printed to the log');
    });

  test(`${path}: the output append throws: exit 1, nothing written after it, the summary written once`, async () => {
    const files = {};
    const calls = [];
    const append = (file, text) => {
      calls.push(file);
      if (file === 'out') throw Object.assign(new Error('EFBIG: file too large, write'), { code: 'EFBIG' });
      files[file] = (files[file] ?? '') + text;
    };
    const result = await plan(runner, { GITHUB_OUTPUT: 'out', GITHUB_STEP_SUMMARY: 'summary' }, append);
    assert.equal(result.code, 1);
    assert.deepEqual(calls, ['summary', 'out'], 'the summary first, then one append, then nothing');
    assert.equal(files.out, undefined);
    assert.equal(files.summary.match(/<pre>/g).length, 1);
    assert.doesNotMatch(files.summary, /Refused/, 'the refusal for a failed end goes to the log only');
    assert.match(result.printed.at(-1), /^Refused: unexpected-failure\./);
  });
}
