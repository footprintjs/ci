// The ONE cleaner for text the release tools do not control (an issue title, a CHANGELOG
// title, a package name, git output, npm's answers, a tarball member's path), shared by the hold
// check and the release route.
//
// Why each step: control, format and bidirectional characters can hide or reorder what a person
// reads; line and paragraph separators can start a new line; and in a GitHub Actions log a line
// holding `::` at its start is a workflow command, as is `##[` (the older form, which the
// runner may read anywhere in a line). So text for the LOG is flattened to one line, `::` and
// `##[` are broken apart wherever they appear ("a ::error:: b" prints as "a : :error: : b"),
// and it is cut to a bound, counted in characters, not bytes. A caller also makes sure no line
// it prints STARTS with this text. Text for a FILE (release notes) keeps its lines and its `::`
// (a Rust path, a C++ name), and loses only control and format characters.
//
// Example: clean('ok\u{202E}::set-output name=x::y') === 'ok: :set-output name=x: :y'

// One line, no control/format/bidi characters, at most `max` characters (then "...").
export function flatten(value, max = 80) {
  const text = typeof value === 'string' ? value : '';
  const flat = text.replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ').replace(/[\p{Cf}\p{Cs}\p{Co}\p{Cn}]/gu, '')
    .replace(/\s+/gu, ' ').trim();
  return cut(flat, max);
}

// Break every `::` and `##[` apart.
export const neutralise = (text) => text.replace(/:(?=:)/g, ': ').replace(/#(?=#\[)/g, '# ');

const cut = (text, max) => {
  const points = Array.from(text);
  return points.length > max ? `${points.slice(0, max).join('')}...` : text;
};

// For the log: flattened, commands broken apart, then cut (cutting after breaking cannot rebuild
// a command: it only removes a tail and adds "...").
export function clean(value, max = 80) {
  return cut(neutralise(flatten(value, Number.MAX_SAFE_INTEGER)), max);
}

// For a file: each line cleaned on its own (leading spaces kept for Markdown nesting), empty
// lines kept, bounded by lines and by characters per line.
export function cleanLines(text, { maxLines = 400, maxLine = 400 } = {}) {
  const lines = (typeof text === 'string' ? text : '').split(/\r\n|\n|\r|\u{2028}|\u{2029}/u);
  const kept = lines.slice(0, maxLines).map((line) => {
    const indent = /^ */.exec(line)[0].slice(0, 16);
    return line.trim() === '' ? '' : indent + flatten(line, maxLine);
  });
  if (lines.length > maxLines) kept.push('', '(The section is longer than the route copies; the rest is in CHANGELOG.md.)');
  return kept;
}
