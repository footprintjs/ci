import { exportedName, exportedNames } from './exports.mjs';
import { moduleModel } from './module.mjs';
import { issue, unknown } from './notes.mjs';

function surface(context, path) {
  const listed = exportedNames(context, path);
  const reasons = [...listed.reasons];
  const names = listed.names.map(name => {
    const result = exportedName(context, path, name);
    reasons.push(...result.reasons);
    return [name, [...new Set(result.owners.flatMap(owner => owner.kinds))].sort()];
  });
  return { names, reasons };
}

export function surfaceChanges(base, head) {
  const paths = new Set([...base.doors.paths, ...head.doors.paths,
    ...[...base.parsed.keys()].filter(path => moduleModel(base, path).exports.size || moduleModel(base, path).stars.length)]);
  const findings = [];
  const unverified = [...base.doors.unverified, ...head.doors.unverified];
  for (const path of paths) {
    const before = surface(base, path);
    const after = surface(head, path);
    if (JSON.stringify(before.names) !== JSON.stringify(after.names)) findings.push(issue('move-exports', { path }, 'Resolved public names or VALUE/TYPE kinds changed.'));
    for (const reason of [...before.reasons, ...after.reasons]) unverified.push(unknown('move-exports', { path }, reason));
  }
  return { findings, unverified };
}
