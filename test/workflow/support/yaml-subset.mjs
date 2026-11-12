// A strict reader for the small part of YAML this repository's route workflows use, so the tests
// check the workflows' STRUCTURE (which job needs which, what each step's env holds) instead of
// grepping text. The repository has no YAML parser and installs none for this (the route itself
// runs with no install); the cost of writing one is kept small by REFUSING everything outside the
// subset, so a later edit that uses another YAML feature fails the tests loudly instead of being
// read differently from GitHub.
//
// Read: block mappings (`key: value`, `key:` + a deeper block), block sequences (`- value`,
// `- key: value` + the rest of that mapping two columns deeper), comments (a line starting with
// `#`, or ` #` after a value outside quotes), literal block scalars (`|`, kept with one final
// newline), plain scalars (true, false, null, integers, text), 'single' and "double" quoted
// scalars (no escapes), and the flow forms `{}` and `[a, b]` of plain scalars.
// Refused: tabs, anchors, aliases, tags, folded scalars, `?` keys, documents (`---`), a duplicate
// key, a plain scalar holding `: ` or starting with a YAML indicator, a sequence at its key's own
// indentation. Values follow YAML 1.2's core schema (so `on` stays the text "on", as GitHub reads it).
//
// test/workflow/yaml-subset.test.mjs holds this reader against a real YAML parser (Ruby's Psych)
// on both workflow files, where Ruby is installed.

const fail = (line, why) => { throw new Error(`yaml-subset: line ${line + 1}: ${why}`); };

// The value part of a line without its trailing comment (a ` #` outside quotes).
function stripComment(text, line) {
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if ((c === "'" || c === '"') && (i === 0 || /[\s[,{]/.test(text[i - 1]))) quote = c;
    else if (c === '#' && (i === 0 || /\s/.test(text[i - 1]))) return text.slice(0, i).trimEnd();
  }
  if (quote) fail(line, 'an unclosed quote');
  return text.trimEnd();
}

const PLAIN_START = /^[&*!|>%@`?,[\]{}#'"]|^- |^-$/;

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
  if (/^-?(0|[1-9][0-9]*)$/.test(text)) return Number(text);
  return text;
}

export function parseYaml(source) {
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
    const cut = body[0].search(/\S/);
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
      const value = stripComment(rest, entry.line);
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
        out.push(scalar(stripComment(content, entry.line), entry.line));
      }
    }
    return out;
  }

  const document = block(0);
  const left = significant();
  if (left) fail(left.line, 'a line outside the document');
  return document;
}
