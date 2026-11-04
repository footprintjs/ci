export function issue(rule, unit, reason) {
  return { rule, path: unit.path, line: unit.line ?? 1, name: unit.name ?? null, reason };
}

export function unknown(kind, unit, reason) {
  return { kind, path: unit.path, line: unit.line ?? 1, reason };
}

export function unique(records) {
  return [...new Map(records.map(item => [JSON.stringify(item), item])).values()]
    .sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0);
}
