import { callableFindings } from './callables.mjs';
import { fileFindings } from './files.mjs';
import { declarationFindings } from './declarations.mjs';

export function evaluateMeasurements(source) {
  return [...callableFindings(source), ...fileFindings(source), ...declarationFindings(source)];
}
