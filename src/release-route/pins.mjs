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
// (another commit, `@main`, `@v1`, an upper-case commit: the pin is compared exactly).
//
// What the rule READS is only that plain line; a fact the route could not read refuses. One rule
// holds every refusal below: a mention is counted on the file's text with only two kinds of
// comment removed (named below), and anything the reader is not certain about refuses. Refusing
// an honest caller now and then is the accepted cost; reading a hidden pin as agreement is not.
// So three more refusals (`workflows-unreadable`):
// - A file the reader cannot be sure it sees as GitHub does, named with the reason: "not UTF-8
//   text" (a UTF-16 file, whose byte-order mark FF FE or FE FF is never UTF-8, decodes to nothing
//   the line rule can see), "a NUL character" (what a UTF-16 file without its mark shows), or "an
//   unusual line-break character" (NEL U+0085, LS U+2028, PS U+2029). YAML 1.1 ends a line at those
//   three and YAML 1.2 does not, and which one GitHub follows was not measured, so a `#` after one
//   may or may not start a line: the reader refuses rather than guess.
// - A mention the line rule did not read. In each file exactly two things are removed as comments:
//   a line whose first character after spaces and tabs is `#`, and, on a line the plain `uses:`
//   rule matched, a ` #...` (space or tab before the `#`) right after the matched value, when that
//   value is a value with no quote, or one quoted value with no backslash and no inner quote
//   (CLOSED_VALUE). Nothing else is removed: a `#` anywhere else may sit inside a quoted
//   value, where YAML reads it as text (`release: { name: "Release check #2", uses: ... }` in a
//   flow mapping, `{"name":"PR #checks", ...}` in a one-line JSON file), and the rest of that line
//   may be a pin GitHub runs. Then ALL white space is removed, an escaped slash `\/` (as some
//   JSON writers emit it) becomes `/`, and the places that name
//   `footprintjs/ci/.github/workflows/release-route.yml@` or `.../release-check.yml@` (letter case
//   ignored) are counted. More places than plain-line pins is a pin spelled another way: a block
//   scalar, the value on the next line, a flow mapping (`{ uses: ... }`), a quoted key, a space
//   before the colon, an anchor or alias, a tag (`!!str`), a complex key, a JSON file, a mention in
//   a `run:` script or a `with:` value. Removing white space is what makes a folded or split value
//   visible: `uses: >-` followed by `footprintjs/ci/.github/workflows/release-` on one line and
//   `route.yml@main` on the next becomes one `...release-route.yml@main`.
// - No pin at all. The workflow that is running names the route, so at least one pin must be read
//   across the files; none means the reader missed it.
// What is NOT caught: (1) a value in quotes written over several lines, or a block scalar
// (`run: |`, `uses: >-`): inside it, a line that starts with `#`, or with `uses:` and a value
// followed by ` #`, is read as if it stood outside, so the rest of that line is dropped as a
// comment though YAML reads it as content. In a quoted value the dropped rest can be a pin GitHub
// runs; in a block scalar the dropped text is the scalar's own and begins with `#` (after white
// space, a line break or the start of the value), so a `uses:` value built that way holds a `#`
// before its `@`, which the route's path at a pin never does (reasoned from YAML's rules, not
// run on GitHub). (2) An escape sequence other than
// `\/` inside a quoted value (`\x2e`, `\u002f`, a `\` line continuation). (3) A YAML tag that
// rewrites the value: `uses: !!binary <base64 of the path and pin>` decodes, in a YAML parser, to
// the path and pin, and so do its other spellings (`!<tag:yaml.org,2002:binary>`, a `%TAG` handle,
// a `%`-escaped suffix); the text holds no mention, so the file says nothing. GitHub's published
// workflow parser (actions/languageservices, yaml-object-reader.ts · getLiteralToken) rejects a
// value that is not a string, a number or a boolean; GitHub's server parser was not measured. The
// three have one cause, the reader reads text and not parsed values, and each needs a deliberately
// odd spelling by someone who can already change the workflow files. Every spelling
// test/release-route/pins.test.mjs lists either agrees, differs or refuses as it says there (the
// three gaps are pinned in its known-gaps test).
//
// What an honest caller can be refused for: a symlinked workflow file (refused even when it does
// not name the route); a file that holds NEL, LS, PS or a NUL character, or is not UTF-8 (refused
// even when it does not name the route); a pin that is not the lower-case 40-character commit; a
// pin written directly before `,`, `}` or `]` (a flow mapping over several lines), which is read
// with that character and so prints `pins-differ` with a pin such as `<commit>,` (a quoted pin
// there is refused `workflows-unreadable` instead); a mention of the
// route's path with `@` outside a plain `uses:` line and outside the two comments removed above
// (which includes a comment after a `uses:` value that holds a backslash or an inner quote). Two
// of these are the price of the one rule: the file with NEL, LS, PS, NUL or bytes that are not
// UTF-8, and the mention outside the two removed comments, for example one in a trailing comment
// on a line that is not a plain `uses:` line:
//
//   - run: echo hi # see footprintjs/ci/.github/workflows/release-check.yml@main
//
// Write each pin as a plain
// `uses: footprintjs/ci/.github/workflows/release-....yml@<commit>` line; a mention on a `#` line,
// or in a comment right after a plain pin, is fine. A `uses:` line inside a `run: |` block counts
// as a pin.
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
// Lines are split on LF, CR and CRLF, so a `uses:` line cannot hide behind a lone carriage
// return; NEL, LS and PS never reach the line rule (the file is refused first, above); a comment
// line never starts with `uses:`.
import { clean } from '../shared/text.mjs';
import { isCommit } from './identity.mjs';
import { isRegularBlob, listAtCommit, readBlob } from './repo.mjs';
import { refuse } from './refusals.mjs';

export const WORKFLOWS_DIR = '.github/workflows';
export const MAX_FILES = 200;
export const MAX_FILE_BYTES = 512 * 1024;

const WORKFLOW_FILE = /\.ya?ml$/i;
const LINE_BREAK = /\r\n|[\n\r]/;
// Line breaks YAML 1.1 honours and YAML 1.2 does not (NEL, LS, PS): a file holding one is refused
// before any line is read (workflowText), so the line rule never has to guess where its lines end.
const UNUSUAL_BREAK = /[\u{85}\u{2028}\u{2029}]/u;
// Fails on any byte sequence that is not UTF-8, a UTF-16 byte-order mark (FF FE, FE FF) included.
const UTF8 = new TextDecoder('utf-8', { fatal: true });
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
  for (const line of lines(text)) {
    const match = USES_LINE.exec(line);
    if (!match) continue;
    const value = unquoted(match[1]);
    if (ROUTE_WORKFLOW.test(value)) pins.push(value.slice(value.indexOf('@') + 1));
  }
  return pins;
}

const lines = (text) => text.replace(/^\uFEFF/, '').split(LINE_BREAK);
// The two things removed as comments (see the header; inside a multi-line quoted value or a block
// scalar the first can drop content, gap (1)). A line whose first character after spaces and tabs
// is `#`:
const COMMENT_LINE = /^[\t ]*#/;
// And, on a plain `uses:` line, what follows its value from a space or tab and a `#` on, when the
// value is a value with no quote, or one quoted value with no backslash and no inner quote.
// Example: `uses: footprintjs/ci/...release-route.yml@<commit> # was @main` loses ` # was @main`;
// `uses: "x #", other: ...` loses nothing (its value `"x` opens a quote it does not close), nor does
// `uses: "a\" #" }, ...` (a backslash) or `uses: 'a'' #' }, ...` (an inner quote).
const TRAILING_COMMENT = /^[\t ]+#.*$/;
const CLOSED_VALUE = /^(?:[^"']*|"[^"\\]*"|'[^']*')$/;
// White space; NEL, LS and PS never get here (a file holding one is refused first).
const WHITE = /\s/gu;
// An escaped slash, as some JSON writers emit `/`: read as the slash it stands for.
const ESCAPED_SLASH = /\\\//g;
const MENTION = /footprintjs\/ci\/\.github\/workflows\/release-(?:route|check)\.yml@/giu;

// One line with only the two kinds of comment removed (see the header).
function withoutCertainComment(line) {
  if (COMMENT_LINE.test(line)) return '';
  const uses = USES_LINE.exec(line);
  if (!uses || !CLOSED_VALUE.test(uses[1])) return line;
  return uses[0] + line.slice(uses[0].length).replace(TRAILING_COMMENT, '');
}

// How many places in one file's text name a route workflow with an `@`, only the two kinds of
// comment and all white space removed (see the header: this is what finds a pin the line rule did not read).
export function routeMentions(text) {
  const bare = lines(text).map(withoutCertainComment).join('').replace(WHITE, '').replace(ESCAPED_SLASH, '/');
  return (bare.match(MENTION) ?? []).length;
}

// The text of one workflow file, or a refusal naming the file and why the reader cannot be sure it
// sees what GitHub sees (see the header).
function workflowText(bytes, name) {
  let text;
  try {
    text = UTF8.decode(bytes);
  } catch {
    refuse('workflows-unreadable', `${name}: not UTF-8 text`);
  }
  if (text.includes('\0')) refuse('workflows-unreadable', `${name}: a NUL character`);
  if (UNUSUAL_BREAK.test(text)) refuse('workflows-unreadable', `${name}: an unusual line-break character`);
  return text;
}

// { agree: true } or { agree: false, file, pin } for the first file (in git's order) and pin that
// differ, both cleaned for printing. Refuses workflows-unreadable when a file is not text the reader
// can be sure of, holds a route mention the line rule did not read, when no route pin is read at
// all, or when it cannot look (and git-failed for an answer that is not git's).
export function workflowPins(git, commit, sha) {
  if (!isCommit(sha)) refuse('input-invalid', 'tool commit');
  const files = listAtCommit(git, commit, WORKFLOWS_DIR, MAX_FILES, 'workflows-unreadable')
    .filter((entry) => entry.type !== 'tree' && WORKFLOW_FILE.test(entry.path));
  let read = 0;
  for (const entry of files) {
    const name = clean(entry.path.slice(WORKFLOWS_DIR.length + 1), 100);
    if (!isRegularBlob(entry)) refuse('workflows-unreadable', name);
    const text = workflowText(readBlob(git, entry.id, MAX_FILE_BYTES, 'workflows-unreadable', name), name);
    const pins = routePins(text);
    if (routeMentions(text) > pins.length) refuse('workflows-unreadable', `${name}: a route pin not on a plain uses line`);
    read += pins.length;
    const differs = pins.find((pin) => pin !== sha);
    if (differs !== undefined) return { agree: false, file: name, pin: clean(differs, 80) };
  }
  if (read === 0) refuse('workflows-unreadable', `no route pin in ${WORKFLOWS_DIR}`);
  return { agree: true };
}
