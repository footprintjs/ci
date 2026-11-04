import { issue, unknown } from './notes.mjs';
import { unitIndex,retainedGroup,removeUnit } from './unit-index.mjs';

export function matchUnits(base, head) {
  const index=unitIndex(head.units);
  const pairs = [];
  const findings = [];
  const unverified = [];
  const groups=new Map();
  for (const old of base.units) {
    const candidates=retainedGroup(index,old);
    const retained=candidates.size===1?candidates.values().next().value:null;
    if (retained) { pairs.push({ base: old, head: retained }); removeUnit(index,retained); }
    else {if(!groups.has(old.key))groups.set(old.key,[]);groups.get(old.key).push(old);}
  }
  for (const donors of groups.values()) {
    const old=donors[0];
    const candidates = [...(index.byKey.get(old.key)??[])];
    if (candidates.length === 1 && donors.length === 1) {
      pairs.push({ base: old, head: candidates[0] }); removeUnit(index,candidates[0]);
    } else if (candidates.length) {
      unverified.push(unknown('move-match', old, 'Multiple whole-unit identities cannot be matched injectively.'));
      for (const candidate of candidates.slice(0, donors.length)) removeUnit(index,candidate);
      if (candidates.length < donors.length) findings.push(issue('move-tokens', old, 'Whole-unit multiplicity decreased.'));
    } else for (const donor of donors) findings.push(issue('move-tokens', donor, 'A complete original statement has no identical candidate token sequence.'));
  }
  for (const unit of index.remaining) findings.push(issue('move-residual', unit, 'Unmatched candidate code is new, copied, or spliced; it is not ancillary.'));
  return { pairs, findings, unverified };
}
