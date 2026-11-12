// Find one version's section and its title in a CHANGELOG.md, in the two styles the family uses.
//
//   titled          ## 0.13.1 — works beside footprintjs 12          (storydeck, storyreel)
//   keepachangelog  ## [4.1.0] - 2026-11-12                           (hcifootprint, lens)
//                   ## [4.1.0] - 2026-11-12 — a title                 (a title is optional)
//
// The title separator is " — " (an em dash between spaces) in both styles.
//
// Why no Markdown model: a second idea of what GitHub renders as a heading, differing from
// GitHub's, is what a crafted CHANGELOG would fool (fences, raw HTML, inline forms all differ).
// So the rule fails closed on anything ambiguous instead of matching the renderer:
//   1. The version's heading text ("## 0.13.1" / "## [4.1.0]") must occur exactly ONCE in the
//      whole file, counted as plain text, wherever it stands (in a fence, in HTML, in a <code>
//      span, mid-line). More than once is changelog-duplicate. A changelog must therefore never
//      quote its own version heading.
//   2. That one occurrence must be a heading line, outside fenced code (CommonMark fences: the
//      same character, at least as long, an unclosed fence runs to the end of the file), and
//      not after an opening <pre>, <script>, <style> or <textarea> with no closing tag before it
//      (the four tags CommonMark keeps raw until their closing tag). Otherwise it is missing.
//   3. The section runs from that heading to the next "## " line OUTSIDE a fence: a "## " inside
//      a fence does not end it. Link definitions ("[4.1.0]: https://...") at its end are dropped.
//
// Text out is bounded and has no control characters (src/shared/text.mjs); the caller decides where it goes.
import { refuse } from './refusals.mjs';
import { cleanLines, flatten } from '../shared/text.mjs';

export const MAX_CHANGELOG_BYTES = 2 * 1024 * 1024;
const VERSION = '([0-9]{1,9}\\.[0-9]{1,9}\\.[0-9]{1,9})';
const HEADINGS = Object.freeze({
  titled: new RegExp(`^## ${VERSION}(?: \u{2014} (.+))?$`, 'u'),
  keepachangelog: new RegExp(`^## \\[${VERSION}\\] - [0-9]{4}-[0-9]{2}-[0-9]{2}(?: \u{2014} (.+))?$`, 'u'),
});
const escape = (text) => text.replace(/[.[\]]/g, '\\$&');
// The plain text that names the version's heading, anywhere in the file.
const MARKERS = Object.freeze({
  titled: (version) => new RegExp(`## ${escape(version)}(?![0-9A-Za-z.+-])`, 'g'),
  keepachangelog: (version) => new RegExp(`## \\[${escape(version)}\\]`, 'g'),
});
const LINK_DEFINITION = /^\[[^\]\n]{1,100}\]: \S+$/;
const RAW_TAGS = Object.freeze(['pre', 'script', 'style', 'textarea']);
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
// The fence a line opens ({ char, length }), or null. (A backtick fence whose info text holds a
// backtick is not a fence.)
function opens(line) {
  const match = FENCE_OPEN.exec(line);
  if (!match || (match[1][0] === '`' && match[2].includes('`'))) return null;
  return { char: match[1][0], length: match[1].length };
}
const closes = (line, fence) => {
  const match = FENCE_CLOSE.exec(line);
  return match !== null && match[1][0] === fence.char && match[1].length >= fence.length;
};

// For each line: is it inside fenced code (an opening or closing fence line counts as inside)?
function fencedLines(lines) {
  let fence = null;
  return lines.map((line) => {
    if (fence) {
      if (closes(line, fence)) fence = null;
      return true;
    }
    fence = opens(line);
    return fence !== null;
  });
}

// Is the text before an occurrence inside a raw HTML block: an opening <pre|script|style|textarea>
// after the last closing tag of the same name?
function insideRawHtml(before) {
  const lower = before.toLowerCase();
  return RAW_TAGS.some((tag) => {
    const opening = [...lower.matchAll(new RegExp(`<${tag}(?=[\\s>/]|$)`, 'g'))].at(-1);
    return opening !== undefined && lower.lastIndexOf(`</${tag}>`) < opening.index;
  });
}

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
  const occurrences = [...text.matchAll(MARKERS[style](version))];
  if (occurrences.length > 1) refuse('changelog-duplicate', version);
  if (occurrences.length === 0) return null;
  const at = occurrences[0].index;
  const lineStart = Math.max(text.lastIndexOf('\n', at - 1), text.lastIndexOf('\r', at - 1)) + 1;
  if (lineStart !== at || insideRawHtml(text.slice(0, at))) return null;
  const lines = text.split(/\r\n|\n|\r/);
  const index = text.slice(0, at).split(/\r\n|\n|\r/).length - 1;
  const match = HEADINGS[style].exec(lines[index]);
  const fenced = fencedLines(lines);
  if (!match || match[1] !== version || fenced[index]) return null;
  let end = lines.length;
  for (let i = index + 1; i < lines.length; i++) if (!fenced[i] && lines[i].startsWith('## ')) { end = i; break; }
  const body = lines.slice(index + 1, end);
  while (body.length > 0 && (body.at(-1).trim() === '' || LINK_DEFINITION.test(body.at(-1)))) body.pop();
  while (body.length > 0 && body[0].trim() === '') body.shift();
  // An empty section has no lines (the notes then say so), not one empty line.
  return { title: flatten(match[2] ?? '', 120), lines: body.length > 0 ? cleanLines(body.join('\n')) : [] };
}
