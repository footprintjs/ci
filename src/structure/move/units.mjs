import ts from 'typescript';
import { sourceComments } from '../references/comments.mjs';
import { unitTokens } from './unit-tokens.mjs';
import { commentOwners } from './comment-owners.mjs';
import { tokenPrefixCount } from './token-position.mjs';

function wiring(node) {
  return ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node) || ts.isExportDeclaration(node);
}

export function wholeUnits(source, files) {
  const comments = sourceComments(source);
  const owners=commentOwners(source,comments);
  return source.sourceFile.statements.filter(node => !wiring(node)).map((node, order) => {
    const { tokens, key } = unitTokens(node, source, files);
    const owned = (owners.get(node)??[]).map(comment => ({ ...comment,
      anchor: tokenPrefixCount(tokens,comment.offset,'end') }));
    return { node, source, tokens, key, comments: owned, path: source.path, order,
      kind: ts.SyntaxKind[node.kind], name: node.name?.getText(source.sourceFile) ??
        (ts.isVariableStatement(node) ? node.declarationList.declarations.map(item => item.name.getText(source.sourceFile)).join(',') : null),
      line: source.sourceFile.getLineAndCharacterOfPosition(node.getStart(source.sourceFile)).line + 1 };
  });
}
