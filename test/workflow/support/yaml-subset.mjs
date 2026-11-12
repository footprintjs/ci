// A strict reader for the small part of YAML this repository's route workflows use, so the tests
// check the workflows' STRUCTURE (which job needs which, what each step's env holds) instead of
// grepping text. The repository has no YAML parser and installs none for this (the route itself
// runs with no install); the cost of writing one is kept small by REFUSING everything outside the
// subset, so a later edit that uses another YAML feature fails the tests loudly instead of being
// read differently from GitHub.
//
// Read: block mappings (`key: value`, `key:` + a deeper block), block sequences (`- value`,
// `- key: value` + the rest of that mapping two columns deeper), comments (a line starting with
// `#`, or from the first ` #` of a plain scalar, as YAML reads them), literal block scalars (`|`, kept with one final
// newline), plain scalars (true, false, null, integers, text), 'single' and "double" quoted
// scalars (no escapes), and the flow forms `{}` and `[a, b]` of plain scalars.
// Refused: tabs, carriage returns, anchors, aliases, tags, folded scalars, `?` keys, documents
// (`---`), a duplicate key, more than one space after `key:`, a plain scalar holding `: ` or
// starting with a YAML indicator, a ` #` inside a quoted part of a plain scalar, text after a
// quoted scalar, numbers and booleans of the core schema other than the forms kept, a sequence at
// its key's own indentation. Values follow YAML 1.2's core schema (so `on` stays the text "on", as GitHub reads it).
//
// test/workflow/yaml-subset.test.mjs holds this reader against a real YAML parser (Ruby's Psych)
// on both workflow files, where Ruby is installed.

const fail = (line, why) => { throw new Error(`yaml-subset: line ${line + 1}: ${why}`); };

// The value part of a line without its trailing comment, read as YAML reads it:
// - a quoted scalar ends at its closing quote ('' is a quote inside single quotes), and after it
//   only a comment may follow (two quoted scalars side by side are refused);
// - a flow sequence ends at its `]`, and after it only a comment may follow;
// - in a plain scalar a comment starts at the FIRST ` #`, whatever quotes stand before it. YAML
//   reads `${{ x == 'a # b' }}` as `${{ x == 'a`; this reader refuses a ` #` that falls inside a
//   quoted part (an odd number of quotes before it), so the author quotes the whole value.
const COMMENT_ONLY = /^(\s+#.*)?$/;
function valueOf(text, line) {
  if (text.startsWith("'") || text.startsWith('"')) {
    const quote = text[0];
    let end = 1;
    for (; end < text.length; end++) {
      if (text[end] !== quote) continue;
      if (quote === "'" && text[end + 1] === "'") { end++; continue; }
      break;
    }
    if (end >= text.length) fail(line, 'an unclosed quote');
    if (!COMMENT_ONLY.test(text.slice(end + 1))) fail(line, `text after a quoted scalar: ${text}`);
    return text.slice(0, end + 1);
  }
  if (text.startsWith('[')) {
    const end = text.indexOf(']');
    if (end === -1 || !COMMENT_ONLY.test(text.slice(end + 1))) fail(line, `a flow sequence not alone on its line: ${text}`);
    return text.slice(0, end + 1);
  }
  const at = text.search(/\s#/);
  const plain = (at === -1 ? text : text.slice(0, at)).trimEnd();
  if (at !== -1 && ((plain.match(/'/g) ?? []).length % 2 === 1 || (plain.match(/"/g) ?? []).length % 2 === 1))
    fail(line, `a " #" inside a quoted part of a plain scalar (YAML reads it as a comment); quote the whole value: ${text}`);
  return plain;
}

const PLAIN_START = /^[&*!|>%@`?,[\]{}#'"]|^- |^-$/;
// What YAML 1.2's core schema reads as a number, a boolean or null, beyond the forms this reader
// keeps (true, false, null, ~ and decimal integers without a leading zero): refused, never text.
const CORE_OTHER = [
  /^[-+]?[0-9]+$/, /^0o[0-7]+$/, /^0x[0-9a-fA-F]+$/,
  /^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/, /^[-+]?\.(inf|Inf|INF)$/, /^\.(nan|NaN|NAN)$/,
  /^(True|TRUE|False|FALSE|Null|NULL)$/,
];

function scalar(text, line) {
  if (text === '' || text === 'null' || text === '~') return null;
  if (/^'.*'$/.test(text)) return text.slice(1, -1).replace(/''/g, "'");
  if (/^".*"$/.test(text)) {
    if (/[\\"]/.test(text.slice(1, -1))) fail(line, 'a double-quoted scalar with an escape or a quote');
    return text.slice(1, -1);
  }
  if (text === '{}') return {};
  if (/^\[.*\]$/.test(text)) {
    const inner = text.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map((item) => {
      const value = item.trim();
      if (value === '' || /[[\]{}'"]/.test(value)) fail(line, 'a flow sequence item that is not a plain scalar');
      return scalar(value, line);
    });
  }
  if (PLAIN_START.test(text)) fail(line, `a plain scalar starting with an indicator: ${text}`);
  if (text.includes(': ') || text.endsWith(':')) fail(line, `a plain scalar holding ": ": ${text}`);
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (/^(0|-?[1-9][0-9]*)$/.test(text)) return Number(text);
  if (CORE_OTHER.some((form) => form.test(text))) fail(line, `a number, boolean or null this reader does not read: ${text}`);
  return text;
}

export function parseYaml(source) {
  if (source.includes('\r')) fail(source.slice(0, source.indexOf('\r')).split('\n').length - 1, 'a carriage return');
  const raw = source.split('\n');
  if (raw.at(-1) === '') raw.pop();
  // Significant lines: { line, indent, text } (comments and blank lines left out); block scalar
  // bodies are read from `raw` by the mapping that owns them.
  const lines = raw.map((text, line) => {
    if (text.includes('\t')) fail(line, 'a tab');
    if (/^(---|\.\.\.)(\s|$)/.test(text) || /^%/.test(text)) fail(line, 'a document marker or directive');
    return { line, indent: text.search(/\S/), text: text.trim() };
  });
  let at = 0;
  const significant = () => {
    while (at < lines.length && (lines[at].indent === -1 || lines[at].text.startsWith('#'))) at++;
    return lines[at];
  };

  function block(indent) {
    const first = significant();
    if (!first || first.indent < indent) return null;
    if (first.indent !== indent) fail(first.line, `indentation ${first.indent}, expected ${indent}`);
    return /^-( |$)/.test(first.text) ? sequence(indent) : mapping(indent);
  }

  function blockScalar(owner, indent) {
    const body = [];
    let next = owner.line + 1;
    for (; next < raw.length && (raw[next].trim() === '' || raw[next].search(/\S/) > indent); next++) body.push(raw[next]);
    while (body.length && body.at(-1).trim() === '') body.pop();
    if (body.length === 0) fail(owner.line, 'an empty block scalar');
    // The indentation of the first line with text (a leading blank line has none).
    const cut = body.find((text) => text.trim() !== '').search(/\S/);
    for (const [i, text] of body.entries()) if (text.trim() !== '' && text.search(/\S/) < cut) fail(owner.line + 1 + i, 'a block scalar line left of its indentation');
    while (at < lines.length && lines[at].line < next) at++;
    return `${body.map((text) => text.slice(cut)).join('\n')}\n`;
  }

  function mapping(indent) {
    const out = {};
    for (let entry = significant(); entry && entry.indent === indent && !/^-( |$)/.test(entry.text); entry = significant()) {
      const match = /^([A-Za-z0-9_][A-Za-z0-9_.-]*):(?: (.*))?$/.exec(entry.text);
      if (!match) fail(entry.line, `not a "key: value" line: ${entry.text}`);
      const [, key, rest = ''] = match;
      if (Object.hasOwn(out, key)) fail(entry.line, `duplicate key ${key}`);
      if (rest.startsWith(' ')) fail(entry.line, `more than one space after "${key}:"`);
      const value = valueOf(rest, entry.line);
      at++;
      if (value === '|') out[key] = blockScalar(entry, indent);
      else if (/^[|>]/.test(value)) fail(entry.line, 'a block scalar other than "|"');
      else if (value === '') {
        const next = significant();
        if (next && next.indent === indent && /^-( |$)/.test(next.text)) fail(next.line, 'a sequence at its key\'s indentation');
        out[key] = next && next.indent > indent ? block(next.indent) : null;
      } else out[key] = scalar(value, entry.line);
    }
    const left = significant();
    if (left && left.indent > indent) fail(left.line, 'a deeper line where none is allowed');
    return out;
  }

  function sequence(indent) {
    const out = [];
    for (let entry = significant(); entry && entry.indent === indent && /^-( |$)/.test(entry.text); entry = significant()) {
      const content = entry.text.slice(1).trimStart();
      if (content === '' || content.startsWith('#')) {
        at++;
        const next = significant();
        out.push(next && next.indent > indent ? block(next.indent) : null);
      } else if (/^[A-Za-z0-9_][A-Za-z0-9_.-]*:( |$)/.test(content)) {
        // "- key: value": a mapping whose first key sits two columns right of the dash.
        lines[at] = { line: entry.line, indent: indent + 2, text: content };
        out.push(mapping(indent + 2));
      } else {
        at++;
        out.push(scalar(valueOf(content, entry.line), entry.line));
      }
    }
    return out;
  }

  const document = block(0);
  const left = significant();
  if (left) fail(left.line, 'a line outside the document');
  return document;
}
