import ts from 'typescript';
import { posix } from 'node:path';
import { literalTargets } from './declaration-loss.mjs';

function possibleText(source, lost) {
  return /\\[ux]/.test(source.text)
    || [...lost.keys()].some(path => source.text.includes(posix.basename(path)));
}

function hasLiteral(source, lost) {
  let found = false;
  const visit = node => {
    if (found) return;
    if (ts.isStringLiteralLike(node) && literalTargets(node.text, source.path, lost).length) found = true;
    ts.forEachChild(node, visit);
  };
  visit(source.sourceFile);
  return found;
}

/** Cheap text rejection before checking already-parsed literal nodes; no reader dataflow. */
export function readerCandidatePaths(parsed, lost) {
  if (!lost.size) return [];
  return [...parsed].filter(([, source]) => possibleText(source, lost) && hasLiteral(source, lost))
    .map(([path]) => path).sort();
}
