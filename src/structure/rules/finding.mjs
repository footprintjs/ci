/** One comparable rule observation. No candidate-provided limit or suppression. */
export function overLimit(source, unit, { rule, value, limit }) {
  if (value <= limit) return [];
  const identity = unit.identity ?? `file:${source.path}`;
  return [{ rule, path: source.path, line: unit.line ?? 1,
    identity, unitId: `${source.path}:${unit.start ?? 0}:${unit.kind ?? 'file'}:${identity}`,
    kind: unit.kind ?? 'file', name: unit.name ?? source.path,
    bodyHash: unit.bodyHash ?? null, value, limit, excess: value - limit }];
}
