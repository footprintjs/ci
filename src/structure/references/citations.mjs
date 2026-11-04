import { posix } from 'node:path';
import { codePath } from '../sources/paths.mjs';

function sourceReference(target) {
  return target === 'src' || target.startsWith('src/') || /^(?:\.\.?\/)+src\//.test(target);
}

function withoutAnchor(target) {
  return target.replace(/(?::L?\d+(?:-\d+)?)?(?:#.*)?$/, '');
}

export function extractReferences(text, offset = 0) {
  const references = [];
  const seen = new Set();
  const add = (target, symbol, start) => {
    if (!sourceReference(target) && !(symbol && codePath(withoutAnchor(target)))) return;
    if (seen.has(start)) return;
    seen.add(start);
    references.push({ target, symbol: symbol ?? null, offset: offset + start });
  };
  for (const match of text.matchAll(/`([^`\n]+)`(?:(?:[ \t\r]|\n[ \t]*\*?)*·(?:[ \t\r]|\n[ \t]*\*?)*`([\w$]+(?:\.[\w$]+)*)`)?/g)) {
    add(match[1], match[2], match.index + 1);
  }
  for (const match of text.matchAll(/(?:^|[\s("'<>])((?:\.\.?\/)*src\/[^\s`"'<>),;]+)/g)) {
    const target = match[1].replace(/[.]$/, '');
    add(target, null, match.index + match[0].indexOf(match[1]));
  }
  return references;
}

function globExpression(pattern) {
  let expression = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        index += 1;
        expression += pattern[index + 1] === '/' ? '(?:.*/)?' : '.*';
        if (pattern[index + 1] === '/') index += 1;
      } else expression += '[^/]*';
    } else if (char === '?') expression += '[^/]';
    else if (char === '[' || char === ']') return null;
    else expression += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`${expression}$`);
}

export function referenceTarget(reference, citingPath, files) {
  const target = reference.exact ? reference.target : withoutAnchor(reference.target);
  if (!target.includes('/') && target !== 'src') {
    const matches = [...files.keys()].filter(path => path.startsWith('src/') && posix.basename(path) === target);
    return matches.length === 1 ? { paths: matches } : { unverified: 'Declaration basename is missing or ambiguous.' };
  }
  const normalized = target.startsWith('.') ? posix.normalize(posix.join(posix.dirname(citingPath), target)) : target;
  if (normalized.startsWith('../') || posix.isAbsolute(normalized)) return { unverified: 'Reference escapes tracked source scope.' };
  if (!reference.exact && /[\[*?]/.test(normalized)) {
    const expression = globExpression(normalized);
    if (!expression) return { unverified: 'Unsupported source-reference glob grammar.' };
    return { paths: [...files.keys()].filter(path => expression.test(path)) };
  }
  const paths = [...files.keys()].filter(path => path === normalized || path.startsWith(`${normalized.replace(/\/$/, '')}/`));
  return { paths };
}

export function historicalPath(path) {
  if (/^changelog\.md$/i.test(posix.basename(path))) return true;
  return path.startsWith('docs/design/') && /^(?:\d{4}[-_]\d{2}(?:[-_]\d{2})?|\d{8})(?:[-_.]|$)/.test(posix.basename(path));
}
