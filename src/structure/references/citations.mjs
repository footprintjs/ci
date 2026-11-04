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

function matchingPaths(target, files, exact = false) {
  if (!exact && /[\[*?]/.test(target)) {
    const expression = globExpression(target);
    if (!expression) return { unverified: 'Unsupported source-reference glob grammar.' };
    return { paths: [...files.keys()].filter(path => expression.test(path)) };
  }
  return { paths: [...files.keys()].filter(path => path === target || path.startsWith(`${target.replace(/\/$/, '')}/`)) };
}

function nestedPackageTarget(target, citingPath, files) {
  for (let folder = posix.dirname(citingPath); folder !== '.'; folder = posix.dirname(folder)) {
    if (files.has(`${folder}/package.json`)) return matchingPaths(`${folder}/${target}`, files).paths?.length > 0;
  }
  return false;
}

function shorthandTarget(target, files) {
  const matches = [...files.keys()].filter(path => path.startsWith('src/') && path.endsWith(`/${target}`));
  return matches.length === 1 ? { paths: matches } : { unverified: 'Source citation root is missing or ambiguous.' };
}

export function referenceTarget(reference, citingPath, files) {
  const target = reference.exact ? reference.target : withoutAnchor(reference.target);
  if (!reference.exact && !target.includes('/') && target !== 'src') return shorthandTarget(target, files);
  const normalized = target.startsWith('.') ? posix.normalize(posix.join(posix.dirname(citingPath), target)) : target;
  if (normalized.startsWith('../') || posix.isAbsolute(normalized)) return { unverified: 'Reference escapes tracked source scope.' };
  const result = matchingPaths(normalized, files, reference.exact);
  if (reference.exact || result.unverified) return result;
  if (sourceReference(target) && !target.startsWith('.') && nestedPackageTarget(target, citingPath, files)) {
    return { unverified: 'Source citation has a nested package context; its intended root is unverified.' };
  }
  if (!result.paths.length && reference.symbol && !sourceReference(target) && !target.startsWith('.')) {
    return shorthandTarget(target, files);
  }
  return result;
}

export function historicalPath(path) {
  if (/^changelog\.md$/i.test(posix.basename(path))) return true;
  return path.startsWith('docs/design/') && /^(?:\d{4}[-_]\d{2}(?:[-_]\d{2})?|\d{8})(?:[-_.]|$)/.test(posix.basename(path));
}
