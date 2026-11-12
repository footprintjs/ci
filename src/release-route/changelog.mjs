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
const FENCE = /^(```|~~~)/;

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
  let fenced = false;
  let open = null;
  lines.forEach((line, index) => {
    if (FENCE.test(line)) fenced = !fenced;
    if (fenced || !line.startsWith('## ')) return;
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
  return { title: flatten(title, 120), lines: cleanLines(body.join('\n')) };
}
