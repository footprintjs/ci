import ts from 'typescript';
import { tokensBetween, tokenHash } from '../syntax/tokens.mjs';
import { resolveRelative } from '../sources/paths.mjs';
import { hasLexicalBinding } from '../bindings/index.mjs';

function moduleLiteral(node) {
  if (!ts.isCallExpression(node) || !node.arguments.length) return null;
  const loader = node.expression.kind === ts.SyntaxKind.ImportKeyword
    || (ts.isIdentifier(node.expression) && node.expression.text === 'require' && !hasLexicalBinding(node.expression));
  return loader && ts.isStringLiteralLike(node.arguments[0]) ? node.arguments[0] : null;
}

function relocatedPaths(node, source, files) {
  const replacements = new Map();
  const visit = current => {
    const literal = moduleLiteral(current);
    if (literal?.text.startsWith('.')) {
      const target = resolveRelative(source.path, literal.text, files);
      if (target.path) replacements.set(literal.getStart(source.sourceFile), JSON.stringify(target.path));
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return replacements;
}

export function unitTokens(node, source, files) {
  const modifiers = new Set((node.modifiers ?? []).filter(item =>
    [ts.SyntaxKind.ExportKeyword, ts.SyntaxKind.DefaultKeyword].includes(item.kind)).map(item => item.getStart(source.sourceFile)));
  const relocations = relocatedPaths(node, source, files);
  const tokens = tokensBetween(source, node.getStart(source.sourceFile), node.getEnd()).filter(token => !modifiers.has(token.start));
  const normalized = tokens.map(token => ({ ...token, text: relocations.get(token.start) ?? token.text }));
  return { tokens, key: tokenHash(normalized) };
}
