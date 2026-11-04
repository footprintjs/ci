import { sourceEdges } from './edges.mjs';
import { folderFindings } from './folders.mjs';
import { sourceLoads } from './loads.mjs';
import { overLimit } from '../rules/finding.mjs';

function importFindings(edges) {
  const counts = new Map();
  for (const edge of edges) {
    if (!edge.unverified) counts.set(edge.from, (counts.get(edge.from) ?? 0) + 1);
  }
  return [...counts].flatMap(([path, value]) => overLimit({ path }, {}, { rule: 'direct-imports', value, limit: 20 }));
}

export function graphAnalysis(files, parsed, doors) {
  const observed = sourceEdges(files, parsed);
  const folders = folderFindings(observed.edges.filter(edge => !edge.unverified), doors.seals);
  return { findings: [...importFindings(observed.edges), ...folders.findings],
    unverified: observed.unverified, loads: sourceLoads(doors.paths, observed.edges),
    edges: observed.edges, mutualSiblingPairs: folders.mutualSiblingPairs };
}
