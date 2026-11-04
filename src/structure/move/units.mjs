import ts from 'typescript';
import { sourceComments } from '../references/comments.mjs';
import { unitTokens } from './unit-tokens.mjs';

function wiring(node) {
  return ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node) || ts.isExportDeclaration(node);
}

function commentOwner(comment, source) {
  const statements = [...source.sourceFile.statements];
  const inside = statements.find(node => comment.offset >= node.getStart(source.sourceFile) && comment.offset < node.getEnd());
  if (inside) return inside;
  const previous = statements.filter(node => node.getEnd() <= comment.offset).at(-1);
  const tail = previous && source.text.slice(previous.getEnd(), comment.offset);
  if (previous && !tail.includes('\n') && !tail.trim()) return previous;
  return statements.find(node => comment.offset >= node.getFullStart() && comment.offset < node.getStart(source.sourceFile));
}

export function wholeUnits(source, files) {
  const comments = sourceComments(source);
  return source.sourceFile.statements.filter(node => !wiring(node)).map((node, order) => {
    const { tokens, key } = unitTokens(node, source, files);
    const owned = comments.filter(comment => commentOwner(comment, source) === node).map(comment => ({ ...comment,
      anchor: tokens.filter(token => token.end <= comment.offset).length }));
    return { node, source, tokens, key, comments: owned, path: source.path, order,
      kind: ts.SyntaxKind[node.kind], name: node.name?.getText(source.sourceFile) ??
        (ts.isVariableStatement(node) ? node.declarationList.declarations.map(item => item.name.getText(source.sourceFile)).join(',') : null),
      line: source.sourceFile.getLineAndCharacterOfPosition(node.getStart(source.sourceFile)).line + 1 };
  });
}
