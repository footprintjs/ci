export function measured(overrides = {}) {
  return { path: 'src/example.ts', physicalLines: 20, codeLines: 10,
    functions: [], classes: [], topLevelLets: [], exports: [], ...overrides };
}

export function callable(overrides = {}) {
  return { name: 'sample', identity: 'function:sample', kind: 'function',
    start: 0, end: 30, line: 1, endLine: 3, codeLines: 3, complexity: 1,
    depth: 0, parameters: 0, jsx: false, bodyHash: 'original', ...overrides };
}
