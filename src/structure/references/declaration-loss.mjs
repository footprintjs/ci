import ts from 'typescript';
import { posix } from 'node:path';
import { measurementPath, testPath } from '../sources/paths.mjs';
import { declarationOwners } from './owners.mjs';

export function lostDeclarations(head, base) {
  const lost = new Map();
  for (const [path, before] of base ?? []) {
    if (!measurementPath(path) || head.get(path)?.text === before.text) continue;
    const oldNames = declarationOwners(before).names;
    const newNames = head.has(path) ? declarationOwners(head.get(path)).names : new Set();
    const names = [...oldNames].filter(name => !newNames.has(name)).sort();
    if (names.length) lost.set(path, names);
  }
  return lost;
}

function testOrScript(path) {
  return testPath(path) || /(?:^|\/)(?:scripts?|bin)\//.test(path);
}

export function literalTargets(text, path, lost) {
  const candidates = [posix.normalize(text)];
  if (text.startsWith('.')) candidates.push(posix.normalize(posix.join(posix.dirname(path), text)));
  return [...new Set(candidates)].filter(target => lost.has(target));
}

function fileLiterals(parsed, lost) {
  const sites = new Map();
  const visit = node => {
    if (ts.isStringLiteralLike(node)) {
      const line = parsed.sourceFile.getLineAndCharacterOfPosition(node.getStart(parsed.sourceFile)).line + 1;
      for (const target of literalTargets(node.text, parsed.path, lost)) {
        sites.set(`${line}:${target}`, { path: parsed.path, line, target, declarations: lost.get(target) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed.sourceFile);
  return [...sites.values()];
}

/** Review hints only: no filesystem-read intent or wrong-owner verdict is inferred. */
export function declarationLossLiterals(head, base = null) {
  const lost = lostDeclarations(head, base);
  if (!lost.size) return [];
  return [...head].filter(([path]) => testOrScript(path)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .flatMap(([, parsed]) => fileLiterals(parsed, lost));
}
