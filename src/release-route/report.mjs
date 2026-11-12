// Everything a step says goes out here: lines to the log, the same lines to the job summary
// ($GITHUB_STEP_SUMMARY), and values for later jobs ($GITHUB_OUTPUT).
//
// Three rules hold for every step:
// - A printed line never STARTS with text the route does not control. Callers write
//   `Fixed words: ${printable(x)}`; `safeLine` is the backstop that cleans the whole line again
//   and puts "Note: " in front of a line that does not start with a letter.
// - A value for a later job is written only when it is in its closed alphabet below. Free text
//   (a title, notes) travels in a file, never as an output.
// - A step that exits 1 never tells a later job to act. Outputs are held until the step ends
//   (`end(code)`); on exit 0 all are written, on exit 1 only those that NAME the run (rule,
//   commit, package, version). So a pass that is refused afterwards (the charted plan whose record
//   cannot be written) leaves no `mode` and no `compare` behind.
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

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// env: the process environment (only GITHUB_OUTPUT and GITHUB_STEP_SUMMARY are read).
// print and append are injected so tests can see exactly what would be written.
export function createReport({ env = {}, print = (line) => process.stdout.write(`${line}\n`), append = appendFileSync } = {}) {
  const lines = [];
  const outputs = [];
  return {
    say(line) {
      const safe = safeLine(line);
      lines.push(safe);
      print(safe);
    },
    output(key, value) {
      if (!Object.hasOwn(OUTPUTS, key) || typeof value !== 'string' || !OUTPUTS[key](value)) refuse('output-invalid', key);
      outputs.push([key, value]);
    },
    // The step's end, once: its outputs (all on exit 0; on exit 1 only those that name the run),
    // then the summary, a <pre> block with every character that HTML or Markdown could act on
    // escaped, so a title cannot add a link or an image to the job page.
    end(code) {
      const kept = code === 0 ? outputs : outputs.filter(([key]) => NAMES_THE_RUN.includes(key));
      if (env.GITHUB_OUTPUT) for (const [key, value] of kept) append(env.GITHUB_OUTPUT, `${key}=${value}\n`);
      outputs.length = 0;
      if (env.GITHUB_STEP_SUMMARY) append(env.GITHUB_STEP_SUMMARY, `<pre>\n${lines.map(escapeHtml).join('\n')}\n</pre>\n`);
    },
    get lines() {
      return [...lines];
    },
  };
}
