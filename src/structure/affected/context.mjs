import ts from 'typescript';
import { trackedFiles, codePath } from '../sources/paths.mjs';
import { parseSource } from '../syntax/parse.mjs';
import { moduleInfo } from './modules.mjs';
import { packageOwnership } from './packages.mjs';
import { discoverTests } from './discovery.mjs';

export function snapshotContext(snapshot) {
  const files = trackedFiles(snapshot ?? { files: [] });
  const parsed = new Map([...files].filter(([path]) => codePath(path))
    .map(([path, file]) => [path, parseSource(file)]));
  const unverified = [...parsed.values()].flatMap(source => source.sourceFile.parseDiagnostics.map(item => ({
    kind: 'parse-error', path: source.path,
    line: source.sourceFile.getLineAndCharacterOfPosition(item.start ?? 0).line + 1,
    reason: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
  })));
  const discovery = discoverTests(files, parsed);
  const ownership = packageOwnership(files);
  const context = { files, parsed, ...ownership, unverified: [...unverified, ...ownership.unverified, ...discovery.unverified] };
  const modules = new Map([...parsed].map(([path, source]) => [path, moduleInfo(source, context)]));
  return { ...context, modules, tests: discovery.tests, discovery: discovery.discovery };
}
