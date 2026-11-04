import { overLimit } from './finding.mjs';

// Add a reasoned exemption only after an actual repository finding establishes it.
export const NAME_EXEMPTIONS = Object.freeze([]);

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
