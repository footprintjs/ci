import ts from 'typescript';

export function sourceComments(parsed) {
  const found = new Map();
  const visit = node => {
    const ranges = [...(ts.getLeadingCommentRanges(parsed.text, node.getFullStart()) ?? []),
      ...(ts.getTrailingCommentRanges(parsed.text, node.getEnd()) ?? [])];
    for (const range of ranges) {
      const overlapsCode = parsed.tokens.some(token => token.start < range.end && token.end > range.pos);
      if (!overlapsCode) found.set(`${range.pos}:${range.end}`, {
        text: parsed.text.slice(range.pos, range.end), offset: range.pos });
    }
    for (const child of node.getChildren(parsed.sourceFile)) visit(child);
  };
  visit(parsed.sourceFile);
  return [...found.values()].sort((a, b) => a.offset - b.offset);
}
