function sameFamily(head, base) {
  if (head.kind !== base.kind) return false;
  if (head.identity === base.identity) return true;
  return head.kind === 'file' && Boolean(head.bodyHash) && head.bodyHash === base.bodyHash;
}

function fitsTier(head, base, tier) {
  if (!sameFamily(head, base)) return false;
  if (tier === 'location') return head.unitId === base.unitId;
  if (tier === 'body') return Boolean(head.bodyHash) && head.bodyHash === base.bodyHash;
  return head.identity === base.identity;
}

function resolveTier(state, tier) {
  const heads = state.head.filter(unit => !state.usedHead.has(unit.unitId));
  const bases = state.base.filter(unit => !state.usedBase.has(unit.unitId));
  const options = heads.map(head => ({ head, bases: bases.filter(base => fitsTier(head, base, tier)) }));
  for (const option of options) {
    if (option.bases.length !== 1) continue;
    const base = option.bases[0];
    const claims = options.filter(item => item.bases.some(unit => unit.unitId === base.unitId));
    if (claims.length !== 1) continue;
    state.usedHead.add(option.head.unitId);
    state.usedBase.add(base.unitId);
    state.pairs.push({ head: option.head, base, matchKind: tier });
  }
}

export function matchProfiles(head, base) {
  const state = { head, base, pairs: [], usedHead: new Set(), usedBase: new Set() };
  for (const tier of ['location', 'body', 'identity']) resolveTier(state, tier);
  const unmatchedHead = head.filter(unit => !state.usedHead.has(unit.unitId));
  const unmatchedBase = base.filter(unit => !state.usedBase.has(unit.unitId));
  const ambiguous = unmatchedHead.filter(unit => unmatchedBase.some(old => sameFamily(unit, old)));
  return { pairs: state.pairs, unmatchedHead, unmatchedBase, ambiguous };
}
