// Find one version's section and its title in a CHANGELOG.md, in the two styles the family uses.
//
//   titled          ## 0.13.1 — works beside footprintjs 12          (storydeck, storyreel)
//   keepachangelog  ## [4.1.0] - 2026-11-12                           (hcifootprint, lens)
//                   ## [4.1.0] - 2026-11-12 — a title                 (a title is optional)
//
// The title separator is " — " (an em dash between spaces) in both styles. A section runs from
// its heading to the next "## " heading; a "## " inside a fenced code block is not a heading, and
// keepachangelog link definitions ("[4.1.0]: https://...") at the end of a section are dropped.
// Two sections for one version is a refusal: which one would be the notes?
//
// Text out is bounded and has no control characters (src/shared/text.mjs); the caller decides where it goes.
import { refuse } from './refusals.mjs';
import { cleanLines, flatten } from '../shared/text.mjs';

export const MAX_CHANGELOG_BYTES = 2 * 1024 * 1024;
// Any x.y.z in a heading; the section is the one whose text equals the planned version exactly.
const VERSION = '([0-9]{1,9}\\.[0-9]{1,9}\\.[0-9]{1,9})';
const HEADINGS = Object.freeze({
  titled: new RegExp(`^## ${VERSION}(?: \u{2014} (.+))?$`, 'u'),
  keepachangelog: new RegExp(`^## \\[${VERSION}\\] - [0-9]{4}-[0-9]{2}-[0-9]{2}(?: \u{2014} (.+))?$`, 'u'),
});
const LINK_DEFINITION = /^\[[^\]\n]{1,100}\]: \S+$/;
// CommonMark fences: an opening fence is three or more backticks or tildes (up to three spaces
// in); it is closed only by a fence of the SAME character, at least as long, with nothing after
// it but spaces. A fence never closed runs to the end of the file. (A backtick fence whose info
// text holds a backtick is not a fence.) Found by the second reader: toggling on any "```" let a
// fake section inside a four-backtick block pass for the real one.
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
// The fence a line opens ({ char, length }), or null.
function opens(line) {
  const match = FENCE_OPEN.exec(line);
  if (!match || (match[1][0] === '`' && match[2].includes('`'))) return null;
  return { char: match[1][0], length: match[1].length };
}
const closes = (line, fence) => {
  const match = FENCE_CLOSE.exec(line);
  return match !== null && match[1][0] === fence.char && match[1].length >= fence.length;
};

// An HTML block that holds raw text (CommonMark's first kind, plus <code>): from a line that
// starts with <pre, <code, <script, <style or <textarea to the line holding its closing tag. A
// "## " inside one is not a heading (round 2 of the second read).
const HTML_OPEN = /^ {0,3}<(pre|code|script|style|textarea)(?=[\s>]|$)/i;
const htmlCloses = (line, tag) => line.toLowerCase().includes(`</${tag}>`);

// bytes -> text: strict UTF-8, bounded. Anything else is changelog-unreadable.
export function decodeChangelog(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_CHANGELOG_BYTES) refuse('changelog-unreadable');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    refuse('changelog-unreadable');
  }
}

// { title: string ('' when none), lines: string[] } for `version`, or null when there is no
// section for it. `style` is the settings' `changelog` value.
export function findSection(text, version, style) {
  if (!Object.hasOwn(HEADINGS, style)) refuse('settings-invalid', 'changelog');
  const heading = HEADINGS[style];
  const lines = text.split(/\r\n|\n|\r/);
  const found = [];
  let fence = null;
  let html = null;
  let open = null;
  lines.forEach((line, index) => {
    if (fence) {
      if (closes(line, fence)) fence = null;
      return;
    }
    if (html) {
      if (htmlCloses(line, html)) html = null;
      return;
    }
    const tag = HTML_OPEN.exec(line);
    if (tag) {
      if (!htmlCloses(line, tag[1].toLowerCase())) html = tag[1].toLowerCase();
      return;
    }
    fence = opens(line);
    if (fence || !line.startsWith('## ')) return;
    if (open) open.end = index;
    open = null;
    const match = heading.exec(line);
    if (match && match[1] === version) found.push((open = { title: match[2] ?? '', start: index + 1, end: lines.length }));
  });
  if (found.length > 1) refuse('changelog-duplicate', version);
  if (found.length === 0) return null;
  const { title, start, end } = found[0];
  const body = lines.slice(start, end);
  while (body.length > 0 && (body.at(-1).trim() === '' || LINK_DEFINITION.test(body.at(-1)))) body.pop();
  while (body.length > 0 && body[0].trim() === '') body.shift();
  // An empty section has no lines (the notes then say so), not one empty line.
  return { title: flatten(title, 120), lines: body.length > 0 ? cleanLines(body.join('\n')) : [] };
}
