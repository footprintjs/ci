import { posix } from 'node:path';
import { LIMITS } from './limits.mjs';
import { overLimit } from './finding.mjs';

export function fileFindings(source) {
  const name = posix.basename(source.path, posix.extname(source.path));
  const catchAll = name === 'misc' || name === 'temp';
  return [
    ...overLimit(source, {}, { rule: 'file-physical-lines', value: source.physicalLines, limit: LIMITS.physicalLines }),
    ...overLimit(source, {}, { rule: 'file-code-lines', value: source.codeLines, limit: LIMITS.fileCodeLines }),
    ...overLimit(source, {}, { rule: 'catch-all-file', value: Number(catchAll), limit: 0 }),
    ...source.classes.flatMap(unit => overLimit(source, unit, { rule: 'class-lines', value: unit.codeLines, limit: LIMITS.classLines })),
  ];
}
