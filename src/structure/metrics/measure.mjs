import { parseSource } from '../syntax/parse.mjs';
import ts from 'typescript';
import { measureUnits } from './units.mjs';
import { measureDeclarations } from './declarations.mjs';

/** JSON-only observations; the parsed AST remains internal to the checker. */
export function measureParsed(parsed) {
  const { path, text } = parsed;
  const physicalLines = text === '' ? 0 : text.split('\n').length - Number(text.endsWith('\n'));
  const diagnostics = parsed.sourceFile.parseDiagnostics.map(item => ({
    line: parsed.sourceFile.getLineAndCharacterOfPosition(item.start ?? 0).line + 1,
    code: item.code, message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
  }));
  return { path, physicalLines, codeLines: parsed.codeLineSet.size,
    ...measureUnits(parsed), ...measureDeclarations(parsed.sourceFile), diagnostics };
}

export function measureSource(input) {
  return measureParsed(parseSource(input));
}
