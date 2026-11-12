// Everything a step says goes out here: lines to the log, the same lines to the job summary
// ($GITHUB_STEP_SUMMARY), and values for later jobs ($GITHUB_OUTPUT).
//
// Two rules hold for every step:
// - A printed line never STARTS with text the route does not control. Callers write
//   `Fixed words: ${printable(x)}`; `safeLine` is the backstop that cleans the whole line again
//   and puts "Note: " in front of a line that does not start with a letter.
// - A value for a later job is written only when it is in its closed alphabet below. Free text
//   (a title, notes) travels in a file, never as an output.
import { appendFileSync } from 'node:fs';
import { COMMIT, PLAIN_VERSION, isPackageName } from './identity.mjs';
import { refuse } from './refusals.mjs';
import { neutralise, clean } from './text.mjs';

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
});

export function safeLine(line) {
  const text = neutralise(clean(String(line), 400));
  return /^[A-Za-z]/.test(text) ? text : `Note: ${text}`;
}

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// env: the process environment (only GITHUB_OUTPUT and GITHUB_STEP_SUMMARY are read).
// print and append are injected so tests can see exactly what would be written.
export function createReport({ env = {}, print = (line) => process.stdout.write(`${line}\n`), append = appendFileSync } = {}) {
  const lines = [];
  return {
    say(line) {
      const safe = safeLine(line);
      lines.push(safe);
      print(safe);
    },
    output(key, value) {
      if (!Object.hasOwn(OUTPUTS, key) || typeof value !== 'string' || !OUTPUTS[key](value)) refuse('output-invalid', key);
      if (env.GITHUB_OUTPUT) append(env.GITHUB_OUTPUT, `${key}=${value}\n`);
    },
    // The summary is a <pre> block with every character that HTML or Markdown could act on
    // escaped, so a title cannot add a link or an image to the job page.
    summary() {
      if (env.GITHUB_STEP_SUMMARY) append(env.GITHUB_STEP_SUMMARY, `<pre>\n${lines.map(escapeHtml).join('\n')}\n</pre>\n`);
    },
    get lines() {
      return [...lines];
    },
  };
}
