export function debt(overrides = {}) {
  return { rule: 'function-lines', path: 'src/example.ts', line: 1,
    identity: 'function:sample', unitId: 'src/example.ts:0:function',
    kind: 'function', name: 'sample', value: 70, limit: 60, excess: 10,
    bodyHash: 'original', ...overrides };
}
