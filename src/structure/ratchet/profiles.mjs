/** A profile owns every over-limit metric for one runtime unit. */
function validateFinding(item) {
  if (!item || typeof item !== 'object') throw new TypeError('Ratchet finding must be an object');
  const textFields = ['unitId', 'identity', 'kind', 'path', 'rule'];
  if (textFields.some(key => typeof item[key] !== 'string' || item[key] === '')) {
    throw new TypeError('Ratchet findings require explicit unit and rule identities');
  }
  if (![item.value, item.limit, item.excess].every(Number.isFinite) ||
      item.limit < 0 || item.excess <= 0 || item.excess !== item.value - item.limit) {
    throw new TypeError('Ratchet findings require coherent finite over-limit metrics');
  }
}

function assertSameUnit(profile, item) {
  if (['identity', 'kind', 'path', 'bodyHash'].some(key => profile[key] !== item[key])) {
    throw new TypeError('One ratchet unit identity cannot describe different units');
  }
  if (profile.byRule.has(item.rule)) throw new TypeError('Duplicate metric for one ratchet unit');
}

export function groupProfiles(findings) {
  const profiles = new Map();
  for (const item of findings) {
    validateFinding(item);
    const current = profiles.get(item.unitId);
    if (current) assertSameUnit(current, item);
    const profile = current ?? { unitId: item.unitId, identity: item.identity, kind: item.kind,
      path: item.path, bodyHash: item.bodyHash, findings: [], byRule: new Map() };
    profile.findings.push(item);
    profile.byRule.set(item.rule, item);
    profiles.set(item.unitId, profile);
  }
  return [...profiles.values()];
}
