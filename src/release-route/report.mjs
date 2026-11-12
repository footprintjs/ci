// Everything a step says goes out here: lines to the log, the same lines to the job summary
// ($GITHUB_STEP_SUMMARY), and values for later jobs ($GITHUB_OUTPUT).
//
// Three rules hold for every step:
// - A printed line never STARTS with text the route does not control. Callers write
//   `Fixed words: ${printable(x)}`; `safeLine` is the backstop that cleans the whole line again
//   and puts "Note: " in front of a line that does not start with a letter.
// - A value for a later job is written only when it is in its closed alphabet below. Free text
//   (a title, notes) travels in a file, never as an output.
// - A step that exits 1 never tells a later job to act. GitHub keeps a failed step's outputs, and a
//   later job that runs after a failure (`if: always()`, a cleanup or notify job) reads them, so
//   the rule is about what is in $GITHUB_OUTPUT when the step ends, not only about what it meant
//   to write. Outputs are held until the step ends (`end(code)`), and `end` keeps four orders:
//   1. It runs once. A second call does nothing, and an `output()` after it is a fault (it throws).
//   2. The summary first, then every held output in ONE append, the last thing the step writes
//      anywhere. A failure before that append (the summary path is a folder, read-only, or its
//      parent is missing) leaves $GITHUB_OUTPUT untouched; after any failed write nothing more is
//      written, so the refusal printed for it reaches the log only.
//   3. Inside that append: the outputs that NAME the run (rule, commit, package, version), then the
//      others, and `mode` as the very last line. A write cut short leaves a prefix of the append: a
//      line cut part-way is not a value of its closed alphabet, and the `mode` line is whole only
//      when everything before it is. Example: a cut inside the commit line leaves
//      "rule=publish\ncommit=61e129bc3", which names the run and tells nothing to act. One window
//      stays: a write that fails on its very last byte leaves `mode=<value>` without its newline,
//      which the runner may still read.
//   4. On exit 1 only the four that name the run are written: a pass refused afterwards (the
//      charted plan whose record cannot be written) leaves no `mode` and no `compare` behind.
import { appendFileSync } from 'node:fs';
import { COMMIT, PLAIN_VERSION, isPackageName } from './identity.mjs';
import { refuse } from './refusals.mjs';
import { clean } from '../shared/text.mjs';

const OUTPUTS = Object.freeze({
  mode: (v) => /^(publish|recover|dry-run|nothing)$/.test(v),
  rule: (v) => /^[a-z][a-z-]{1,40}$/.test(v),
  compare: (v) => /^(yes|no)$/.test(v),
  commit: (v) => COMMIT.test(v),
  version: (v) => PLAIN_VERSION.test(v),
  package: (v) => isPackageName(v),
  file: (v) => v === 'package.tgz',
  'title-file': (v) => v === 'title.txt',
  'notes-file': (v) => v === 'notes.md',
  publish: (v) => v === 'yes' || v === 'no',
  tag: (v) => v === 'create' || v === 'skip',
  release: (v) => v === 'create' || v === 'skip',
});

export function safeLine(line) {
  const text = clean(String(line), 400);
  return /^[A-Za-z]/.test(text) ? text : `Note: ${text}`;
}

// What a refused step still writes: the names of the run, never an instruction to act.
const NAMES_THE_RUN = Object.freeze(['rule', 'commit', 'package', 'version']);

// The order of the one append (order 3 above): the names of the run, the other outputs, `mode` last.
const inWriteOrder = (kept) => [
  ...kept.filter(([key]) => NAMES_THE_RUN.includes(key)),
  ...kept.filter(([key]) => !NAMES_THE_RUN.includes(key) && key !== 'mode'),
  ...kept.filter(([key]) => key === 'mode'),
];

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// env: the process environment (only GITHUB_OUTPUT and GITHUB_STEP_SUMMARY are read).
// print and append are injected so tests can see exactly what would be written.
export function createReport({ env = {}, print = (line) => process.stdout.write(`${line}\n`), append = appendFileSync } = {}) {
  const lines = [];
  const outputs = [];
  let ended = false;
  return {
    say(line) {
      const safe = safeLine(line);
      lines.push(safe);
      print(safe);
    },
    output(key, value) {
      if (ended) throw new Error('an output after the step ended');
      if (!Object.hasOwn(OUTPUTS, key) || typeof value !== 'string' || !OUTPUTS[key](value)) refuse('output-invalid', key);
      outputs.push([key, value]);
    },
    // The step's end, once (the four orders above). The summary is a <pre> block with every
    // character that HTML or Markdown could act on escaped, so a title cannot add a link or an
    // image to the job page.
    end(code) {
      if (ended) return;
      ended = true;
      const held = outputs.splice(0);
      if (env.GITHUB_STEP_SUMMARY) append(env.GITHUB_STEP_SUMMARY, `<pre>\n${lines.map(escapeHtml).join('\n')}\n</pre>\n`);
      const kept = inWriteOrder(code === 0 ? held : held.filter(([key]) => NAMES_THE_RUN.includes(key)));
      if (env.GITHUB_OUTPUT && kept.length > 0) append(env.GITHUB_OUTPUT, kept.map(([key, value]) => `${key}=${value}\n`).join(''));
    },
    get lines() {
      return [...lines];
    },
  };
}
