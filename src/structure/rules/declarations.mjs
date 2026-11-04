import { overLimit } from './finding.mjs';

// Add a reasoned exemption only after an actual repository finding establishes it.
export const NAME_EXEMPTIONS = Object.freeze([
  Object.freeze({ name: 'crc32', reason: 'CRC-32 names the checksum algorithm and its bit width, not a numbered implementation variant.',
    evidence: 'agentfootprint b653e091d2f753d709044eaa0a5f19aec991d1dd src/bug-report/zip.ts:218' }),
  Object.freeze({ name: 'sha256', reason: 'SHA-256 names the hash algorithm and its bit width, not a numbered implementation variant.',
    evidence: 'agentfootprint b653e091d2f753d709044eaa0a5f19aec991d1dd src/rag/hash.ts:16; src/rag/index.ts:17' }),
]);

export function declarationFindings(source) {
  return [
    ...source.topLevelLets.flatMap(unit => overLimit(source,
      { ...unit, identity: `state:${unit.name}`, kind: 'state', start: unit.line }, { rule: 'module-state', value: 1, limit: 0 })),
    ...source.exports.flatMap(unit => overLimit(source,
      { ...unit, identity: `export:${unit.name}`, kind: 'export', start: unit.line },
      { rule: 'number-suffixed-export', value: Number(/\d+$/.test(unit.name)
        && !NAME_EXEMPTIONS.some(item => item.name === unit.name)), limit: 0 })),
  ];
}
