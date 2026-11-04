import { exportedName, exportedNames } from './exports.mjs';
import { issue, unknown } from './notes.mjs';
import { comparedDoors } from './door-policy.mjs';

function surface(context, path, identity) {
  const listed = exportedNames(context, path);
  const reasons = [...listed.reasons];
  const names = listed.names.map(name => {
    const result = exportedName(context, path, name);
    reasons.push(...result.reasons);
    const owners=result.owners.map(owner=>[owner.unit?identity.get(owner.unit):owner.external,owner.name,owner.kinds]);
    if(result.owners.some(owner=>owner.unit&&!identity.has(owner.unit)))reasons.push('Public declaration could not be paired injectively.');
    return [name, [...new Set(result.owners.flatMap(owner => owner.kinds))].sort(), owners];
  });
  return { names, reasons };
}

export function surfaceChanges(base, head, identity) {
  const scope=comparedDoors(base,head);
  const paths=scope.paths;
  const findings = [];
  const unverified = [...base.doors.unverified, ...head.doors.unverified,...scope.unverified];
  for (const path of paths) {
    const before = surface(base, path, identity);
    const after = surface(head, path, identity);
    if (JSON.stringify(before.names) !== JSON.stringify(after.names)) findings.push(issue('move-exports', { path }, 'Resolved public names, VALUE/TYPE kinds, or declaration owners changed.'));
    for (const reason of [...before.reasons, ...after.reasons]) unverified.push(unknown('move-exports', { path }, reason));
  }
  return { findings, unverified };
}
