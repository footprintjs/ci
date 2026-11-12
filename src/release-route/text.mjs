// Text the route does not control (a CHANGELOG title, a package name, git output, npm's
// answers, a tarball member's path) is cleaned here before it is printed or written.
//
// Why each step: control, format and bidirectional characters can hide or reorder what a person
// reads; line and paragraph separators can start a new line; and in a GitHub Actions log a line
// holding `::` at its start is a workflow command, as is `##[` (the older form). So text for the
// LOG is flattened to one line, `::` and `##[` are broken apart wherever they appear, and it is
// cut to a bound. The printer (report.mjs) also makes sure no line STARTS with this text.
// Text for a FILE (release notes) keeps its lines and its `::` (a Rust path, a C++ name), and
// loses only control and format characters.
//
// Example: printable('ok\u{202E}::set-output name=x::y') === 'ok: :set-output name=x: :y'

// One line, no control/format/bidi characters, at most `max` characters (then "...").
export function clean(value, max = 120) {
  const text = typeof value === 'string' ? value : '';
  const flat = text
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/[\p{Cf}\p{Cs}\p{Co}\p{Cn}]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  const points = Array.from(flat);
  return points.length > max ? `${points.slice(0, max).join('')}...` : flat;
}

// Break every `::` and `##[` apart. Applied after the cut, so a cut cannot rebuild one.
export function neutralise(text) {
  return text.replace(/:(?=:)/g, ': ').replace(/#(?=#\[)/g, '# ');
}

// For the log.
export const printable = (value, max = 120) => neutralise(clean(value, max));

// For a file: each line cleaned on its own (leading spaces kept for Markdown nesting), empty
// lines kept, bounded by lines and by characters per line.
export function cleanLines(text, { maxLines = 400, maxLine = 400 } = {}) {
  const lines = (typeof text === 'string' ? text : '').split(/\r\n|\n|\r|\u{2028}|\u{2029}/u);
  const kept = lines.slice(0, maxLines).map((line) => {
    const indent = /^ */.exec(line)[0].slice(0, 16);
    return line.trim() === '' ? '' : indent + clean(line, maxLine);
  });
  if (lines.length > maxLines) kept.push('', '(The section is longer than the route copies; the rest is in CHANGELOG.md.)');
  return kept;
}
