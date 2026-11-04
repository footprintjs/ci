import { measurementPath } from '../../sources/paths.mjs';
import { topLevelUnits } from './units.mjs';

function catalog(context) {
  const files = new Map();
  const counts = new Map();
  const byKey = new Map();
  for (const [path, parsed] of context.parsed) {
    if (!measurementPath(path)) continue;
    const units = topLevelUnits(parsed);
    files.set(path, units);
    for (const unit of units) {
      counts.set(unit.key, (counts.get(unit.key) ?? 0) + 1);
      byKey.set(unit.key, [...(byKey.get(unit.key) ?? []), unit]);
    }
  }
  return { files, counts, byKey };
}

export function movedFileEvidence(headContext, baseContext) {
  const head = catalog(headContext);
  const base = catalog(baseContext);
  const moved = new Map();
  for (const [path, units] of head.files) {
    if (baseContext.files.has(path) || !units.length) continue;
    if (units.some(unit => (base.counts.get(unit.key) ?? 0) < head.counts.get(unit.key))) continue;
    moved.set(path, units.map(({ key, path: headPath, line: headLine, ...unit }) => ({ ...unit, headPath, headLine,
      baseCandidates: base.byKey.get(key).map(({ path, line }) => ({ path, line })) })));
  }
  return moved;
}
