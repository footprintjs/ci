import { issue, unknown } from './notes.mjs';

function selectRetained(base, available) {
  const exact = available.filter(unit => unit.path === base.path && unit.key === base.key);
  return exact.length === 1 ? exact[0] : null;
}

export function matchUnits(base, head) {
  const remaining = new Set(head.units);
  const pairs = [];
  const findings = [];
  const unverified = [];
  const pending = [];
  const processed = new Set();
  for (const old of base.units) {
    const retained = selectRetained(old, [...remaining]);
    if (retained) { pairs.push({ base: old, head: retained }); remaining.delete(retained); }
    else pending.push(old);
  }
  for (const old of pending) {
    if (processed.has(old.key)) continue;
    processed.add(old.key);
    const candidates = [...remaining].filter(unit => unit.key === old.key);
    const donors = pending.filter(unit => unit.key === old.key);
    if (candidates.length === 1 && donors.length === 1) {
      pairs.push({ base: old, head: candidates[0] }); remaining.delete(candidates[0]);
    } else if (candidates.length) {
      unverified.push(unknown('move-match', old, 'Multiple whole-unit identities cannot be matched injectively.'));
      for (const candidate of candidates.slice(0, donors.length)) remaining.delete(candidate);
      if (candidates.length < donors.length) findings.push(issue('move-tokens', old, 'Whole-unit multiplicity decreased.'));
    } else for (const donor of donors) findings.push(issue('move-tokens', donor, 'A complete original statement has no identical candidate token sequence.'));
  }
  for (const unit of remaining) findings.push(issue('move-residual', unit, 'Unmatched candidate code is new, copied, or spliced; it is not ancillary.'));
  return { pairs, findings, unverified };
}
