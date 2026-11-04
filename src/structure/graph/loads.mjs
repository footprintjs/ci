import { productionPath } from '../sources/paths.mjs';

function closure(entry, graph, eagerOnly) {
  const visited = new Set();
  const pending = [entry];
  while (pending.length) {
    const path = pending.pop();
    if (visited.has(path)) continue;
    visited.add(path);
    for (const edge of graph.get(path) ?? []) {
      if (edge.to && productionPath(edge.to) && (!eagerOnly || edge.eager)) pending.push(edge.to);
    }
  }
  return [...visited].sort();
}

export function sourceLoads(doors, edges) {
  const graph = new Map();
  for (const edge of edges) graph.set(edge.from, [...(graph.get(edge.from) ?? []), edge]);
  return [...doors].sort().map(path => ({ path, scope: 'tracked-production-src',
    eagerSourceFiles: closure(path, graph, true), potentialSourceFiles: closure(path, graph, false) }));
}
