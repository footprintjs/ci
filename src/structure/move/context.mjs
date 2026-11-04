import { trackedFiles, codePath } from '../sources/paths.mjs';
import { parseFiles } from '../syntax/files.mjs';
import { discoverDoors } from '../sources/doors.mjs';
import { wholeUnits } from './units.mjs';
import ts from 'typescript';

export function moveContext(snapshot, previous = null) {
  const files = trackedFiles(snapshot);
  // Reuse immutable syntax only. Unit keys and ownership still use this snapshot's files.
  const parsed = parseFiles([...files].filter(([path]) => codePath(path)), previous);
  const units = [...parsed.values()].flatMap(source => wholeUnits(source, files));
  const unverified = [...parsed.values()].flatMap(source => source.sourceFile.parseDiagnostics.map(item => ({
    kind: 'parse-error', path: source.path, line: source.sourceFile.getLineAndCharacterOfPosition(item.start ?? 0).line + 1,
    reason: ts.flattenDiagnosticMessageText(item.messageText, '\n') })));
  return { files, parsed, units, unverified, doors: discoverDoors(files, parsed), byNode: new Map(units.map(unit => [unit.node, unit])) };
}
