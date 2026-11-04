import { moveContext } from './context.mjs';
import { matchUnits } from './match.mjs';
import { bindingChanges } from './bindings.mjs';
import { surfaceChanges } from './surface.mjs';
import { commentChanges } from './comments.mjs';
import { orderCoverage } from './order.mjs';
import { importOrderCoverage } from './imports.mjs';
import { movedReferences } from './references.mjs';
import { ancillaryChanges } from './ancillary.mjs';
import { unique } from './notes.mjs';
import { wiringCoverage } from './wiring.mjs';
import { residualComments } from './comment-residual.mjs';
import { environmentCoverage } from './environment.mjs';

/** Pure syntax proof; incomplete coverage is never an equivalence verdict. */
export function verifyMove({ head: headSnapshot, base: baseSnapshot }) {
  const base = moveContext(baseSnapshot);
  const head = moveContext(headSnapshot);
  const matched = matchUnits(base, head);
  const bindings = bindingChanges(matched.pairs, base, head);
  const surfaces = surfaceChanges(base, head, bindings.identity);
  const comments = commentChanges(matched.pairs, base, head, bindings.identity);
  const references = movedReferences(base, head,matched.pairs);
  const ancillary = ancillaryChanges(base, head);
  const unverified = unique([...base.unverified, ...head.unverified, ...matched.unverified, ...bindings.unverified, ...surfaces.unverified,
    ...orderCoverage(matched.pairs, base), ...importOrderCoverage(base, head, bindings.identity),
    ...references.unverified, ...ancillary.unverified,...wiringCoverage(base,head,matched.pairs),
    ...environmentCoverage(matched.pairs,base,head)]);
  return { verification:'move',headId:headSnapshot.id??null,baseId:baseSnapshot.id??null,
  findings: unique([...matched.findings, ...bindings.findings, ...surfaces.findings,
    ...comments.findings, ...references.findings]), coverage: { complete: unverified.length === 0, unverified },
  moves: matched.pairs.filter(pair => pair.base.path !== pair.head.path).map(pair => ({ name: pair.base.name,
    kind: pair.base.kind, from: { path: pair.base.path, line: pair.base.line }, to: { path: pair.head.path, line: pair.head.line } })),
  ancillaryChanges: unique([...ancillary.changes, ...comments.ancillaryChanges,...residualComments(base,head)]), sourceReaders: references.sourceReaders,
  referenceScope: references.referenceScope };
}
