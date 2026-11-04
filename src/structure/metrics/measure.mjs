import { parseSource } from '../syntax/parse.mjs';

/** Red-stage skeleton: metric discovery is intentionally not implemented yet. */
export function measureParsed(parsed) {
  const { path, text } = parsed;
  const physicalLines = text === '' ? 0 : text.split('\n').length - Number(text.endsWith('\n'));
  return { path, physicalLines, codeLines: 0, functions: [], classes: [],
    topLevelLets: [], exports: [], diagnostics: [] };
}

export function measureSource(input) {
  return measureParsed(parseSource(input));
}
