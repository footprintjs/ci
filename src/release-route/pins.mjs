// Do the caller's workflow files pin the release route at the commit that is running? (fact
// `pinsAgree`). A package calls the route from two files, `publish.yml` (release-route.yml) and its
// pull-request workflow (release-check.yml). Nothing held them to the same commit: a pull request
// could move one pin and leave the other, and the check would keep answering for code the release
// does not run (storydeck pull request 46, second reader, finding 7).
//
// The rule: every line of `.github/workflows/*.yml` / `*.yaml` at the planned commit whose first
// token is `uses:` (or `- uses:`) and which names `footprintjs/ci/.github/workflows/release-route.yml@`
// or `.../release-check.yml@` must name exactly the commit running (ROUTE_TOOL_SHA). Example:
//
//   uses: footprintjs/ci/.github/workflows/release-route.yml@67dc3738bfba1e8cdf960b0301450db6ff410692 # reviewed
//
// agrees when 67dc373... is the commit running, and is `pins-differ` when it is any other text
// (another commit, `@main`, `@v1`). A file that names neither workflow says nothing either way.
//
// The files are UNTRUSTED text: a pull request from a fork runs the check with its own workflow
// files. So: no YAML parser (this is a line rule, nothing is evaluated); the folder is listed once
// and each file read by its blob id (repo.mjs · listAtCommit, readBlob), at most MAX_FILES files
// of at most MAX_FILE_BYTES each, a file that is not a regular blob is unreadable (a symlink is
// never followed); and nothing of a file leaves this module but the first disagreeing file's name
// and the pin it found, both cleaned and cut (src/shared/text.mjs · clean).
//
// What it catches is the MISTAKE (one pin moved, the other forgotten), like `tool-not-reviewed`.
// It cannot stop a person who edits the caller's workflow on purpose: that edit changes what runs.
// Lines are split on every break YAML or a reader might honour (LF, CR, NEL, LS, PS), so a `uses:`
// line cannot hide behind a lone carriage return; a comment line never starts with `uses:`.
import { clean } from '../shared/text.mjs';
import { isCommit } from './identity.mjs';
import { isRegularBlob, listAtCommit, readBlob } from './repo.mjs';
import { refuse } from './refusals.mjs';

export const WORKFLOWS_DIR = '.github/workflows';
export const MAX_FILES = 200;
export const MAX_FILE_BYTES = 512 * 1024;

const WORKFLOW_FILE = /\.ya?ml$/i;
const LINE_BREAK = /\r\n|[\n\r\u0085\u2028\u2029]/u;
// The first token is `uses:` (a job that calls a workflow) or `- uses:` (a step; GitHub refuses a
// workflow there, but counting it only refuses more). The value is its first word.
const USES_LINE = /^[\t ]*(?:-[\t ]+)?uses:[\t ]+(\S+)/;
// GitHub reads owner and repository names without regard to letter case, so this does too.
const ROUTE_WORKFLOW = /^footprintjs\/ci\/\.github\/workflows\/release-(?:route|check)\.yml@/i;

// The value of a `uses:` line without one pair of surrounding quotes.
const unquoted = (word) => (/^(["']).*\1$/.test(word) && word.length >= 2 ? word.slice(1, -1) : word);

// The pins in one file's text that name the route: the text after `@` on each such line.
export function routePins(text) {
  const pins = [];
  for (const line of text.replace(/^\uFEFF/, '').split(LINE_BREAK)) {
    const match = USES_LINE.exec(line);
    if (!match) continue;
    const value = unquoted(match[1]);
    if (ROUTE_WORKFLOW.test(value)) pins.push(value.slice(value.indexOf('@') + 1));
  }
  return pins;
}

// { agree: true } or { agree: false, file, pin } for the first file (in git's order) and pin that
// differ, both cleaned for printing. Refuses workflows-unreadable or git-failed when it cannot look.
export function workflowPins(git, commit, sha) {
  if (!isCommit(sha)) refuse('input-invalid', 'tool commit');
  const files = listAtCommit(git, commit, WORKFLOWS_DIR, MAX_FILES, 'workflows-unreadable')
    .filter((entry) => entry.type !== 'tree' && WORKFLOW_FILE.test(entry.path));
  for (const entry of files) {
    const name = clean(entry.path.slice(WORKFLOWS_DIR.length + 1), 100);
    if (!isRegularBlob(entry)) refuse('workflows-unreadable', name);
    const text = readBlob(git, entry.id, MAX_FILE_BYTES, 'workflows-unreadable', name).toString('utf8');
    const differs = routePins(text).find((pin) => pin !== sha);
    if (differs !== undefined) return { agree: false, file: name, pin: clean(differs, 80) };
  }
  return { agree: true };
}
