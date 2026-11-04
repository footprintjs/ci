import { inertUnit } from './inert.mjs';
import { unknown } from './notes.mjs';

export function orderCoverage(pairs, base) {
  const unverified = [];
  const moved = pairs.filter(pair => pair.base.path !== pair.head.path);
  for (const pair of moved) {
    if (!inertUnit(pair.base.node)) unverified.push(unknown('load-order', pair.head, 'Moved unit may execute at load; its order is not proven.'));
    const siblings = moved.filter(other => other.head.path === pair.head.path && other.base.path === pair.base.path);
    if (siblings.some(other => (other.base.order - pair.base.order) * (other.head.order - pair.head.order) < 0)) {
      unverified.push(unknown('move-order', pair.head, 'Intact source runs were reordered; syntax identity does not decide the change.'));
    }
    const orders = siblings.map(other => other.base.order);
    const gaps = base.units.filter(unit => unit.path === pair.base.path && unit.order > Math.min(...orders)
      && unit.order < Math.max(...orders) && !moved.some(other => other.base === unit));
    if (gaps.some(unit => !inertUnit(unit.node))) unverified.push(unknown('load-order', pair.head, 'A retained separator may execute at load.'));
  }
  return unverified;
}
