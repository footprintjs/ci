import ts from 'typescript';
import { sourceTokens, tokenLines } from './tokens.mjs';

/** Internal syntax snapshot; no program, checker, emit, or candidate evaluation. */
export function parseSource({ path, text }) {
  const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const tokens = sourceTokens(sourceFile);
  return { path, text, sourceFile, tokens, codeLineSet: tokenLines(sourceFile, tokens) };
}
