export function measured(overrides = {}) {
  return { path: 'src/example.ts', physicalLines: 20, codeLines: 10,
    functions: [], classes: [], topLevelLets: [], exports: [], ...overrides };
}

export function callable(overrides = {}) {
  return { name: 'sample', identity: 'function:sample', kind: 'function',
    start: 0, end: 30, line: 1, endLine: 3, codeLines: 3, complexity: 1,
    depth: 0, parameters: 0, jsx: false, bodyHash: 'original', ...overrides };
}

export function debt(overrides = {}) {
  return { rule: 'function-lines', path: 'src/example.ts', line: 1,
    identity: 'function:sample', unitId: 'src/example.ts:0:function',
    kind: 'function', name: 'sample', value: 70, limit: 60, excess: 10,
    bodyHash: 'original', ...overrides };
}
