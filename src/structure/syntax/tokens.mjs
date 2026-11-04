import ts from 'typescript';
import { createHash } from 'node:crypto';

/** AST token boundaries preserve regex, template and JSX lexical context. */
export function sourceTokens(sourceFile) {
  const tokens = [];
  const visit = node => {
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return;
    if (node.kind <= ts.SyntaxKind.LastToken) {
      const start = node.getStart(sourceFile);
      const end = node.getEnd();
      const text = sourceFile.text.slice(start, end);
      if (end > start && text.trim()) tokens.push({ kind: node.kind, start, end, text });
      return;
    }
    for (const child of node.getChildren(sourceFile)) visit(child);
  };
  visit(sourceFile);
  return tokens;
}

export function tokenLines(sourceFile, tokens) {
  const lines = new Set();
  for (const token of tokens) {
    let offset = token.start;
    for (const piece of token.text.split('\n')) {
      if (piece.trim()) lines.add(sourceFile.getLineAndCharacterOfPosition(offset).line + 1);
      offset += piece.length + 1;
    }
  }
  return lines;
}

export function tokensBetween(parsed, start, end) {
  return parsed.tokens.filter(token => token.start >= start && token.end <= end);
}

export function tokenHash(tokens) {
  return createHash('sha256').update(JSON.stringify(tokens.map(({ kind, text }) => [kind, text]))).digest('hex');
}
