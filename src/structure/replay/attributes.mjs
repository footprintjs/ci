import { checkedPath } from './grammar.mjs';

function admittedLine(line) {
  const text = line.trim();
  if (!text || text.startsWith('#')) return true;
  const match = /^(\S+)[ \t]+(.+)$/.exec(text);
  if (!match || /["\\]/.test(match[1]) || match[1].startsWith('[attr]')) return false;
  return match[2].split(/[ \t]+/).every(attribute => /^[-!]?linguist-[A-Za-z0-9_-]+(?:=[^\s"\\]+)?$/.test(attribute));
}

function fileCoverage(file, treeId) {
  if (!['100644', '100755'].includes(file.mode) || file.content === 'path-only'
    || typeof file.text !== 'string' || !file.text.isWellFormed() || file.text.includes('\0')) {
    return [{ kind: 'merge-attributes', treeId, path: file.path, line: 1, reason: 'Tracked attribute bytes or mode are unsupported.' }];
  }
  return file.text.split(/\r?\n/).flatMap((line, index) => admittedLine(line) ? [] : [{
    kind: 'merge-attributes', treeId, path: file.path, line: index + 1,
    reason: 'Attribute syntax is outside the finite linguist-only metadata grammar.' }]);
}

export function attributeCoverage(trees) {
  if (!Array.isArray(trees)) throw new TypeError('Missing attribute trees.');
  return trees.flatMap(tree => {
    if (!tree || !Array.isArray(tree.files)) throw new TypeError('Missing attribute tree files.');
    const paths = new Set();
    return tree.files.flatMap(file => {
      const path = checkedPath(file?.path);
      if (path.split('/').at(-1) !== '.gitattributes') return [];
      if (paths.has(path)) throw new TypeError('Duplicate tracked attribute file.');
      paths.add(path);
      return fileCoverage(file, tree.id);
    });
  });
}
