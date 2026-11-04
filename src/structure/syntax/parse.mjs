import ts from 'typescript';

/** Internal syntax snapshot; no program, checker, emit, or candidate evaluation. */
export function parseSource({ path, text }) {
  const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false);
  return { path, text, sourceFile, codeLineSet: new Set() };
}
