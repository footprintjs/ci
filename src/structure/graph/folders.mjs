import { posix } from 'node:path';
import { overLimit } from '../rules/finding.mjs';

function siblingPair(from, to) {
  const left = posix.dirname(from).split('/');
  const right = posix.dirname(to).split('/');
  let common = 0;
  while (common < left.length && common < right.length && left[common] === right[common]) common += 1;
  if (common === left.length || common === right.length) return null;
  const a = left.slice(0, common + 1).join('/');
  const b = right.slice(0, common + 1).join('/');
  return { sorted: [a, b].sort(), forward: a < b };
}

function mutualPairs(edges) {
  const pairs = new Map();
  for (const edge of edges) {
    if (!edge.to) continue;
    const pair = siblingPair(edge.from, edge.to);
    if (!pair) continue;
    const key = pair.sorted.join('\0');
    const current = pairs.get(key) ?? { folders: pair.sorted, forward: [], reverse: [] };
    current[pair.forward ? 'forward' : 'reverse'].push(edge);
    pairs.set(key, current);
  }
  return [...pairs.values()].filter(pair => pair.forward.length && pair.reverse.length);
}

function sealFindings(edges, seals) {
  return edges.flatMap(edge => seals.flatMap(seal => {
    if (!edge.to?.startsWith(seal.folder) || edge.from === seal.facade || edge.from.startsWith(seal.folder)) return [];
    return overLimit({ path: edge.from }, { line: edge.line, kind: 'dependency',
      identity: `seal:${seal.folder}:${edge.to}`, name: edge.to },
    { rule: 'sealed-folder', value: 1, limit: 0 });
  }));
}

export function folderFindings(edges, seals) {
  const pairs = mutualPairs(edges);
  const findings = pairs.flatMap(pair => overLimit({ path: pair.forward[0].from },
    { kind: 'folder', identity: `siblings:${pair.folders.join('|')}`, name: pair.folders.join(' <-> ') },
    { rule: 'mutual-siblings', value: pair.forward.length + pair.reverse.length, limit: 0 }));
  return { findings: [...findings, ...sealFindings(edges, seals)], mutualSiblingPairs: pairs };
}
