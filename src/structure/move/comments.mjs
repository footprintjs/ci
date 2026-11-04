import { extractReferences, referenceTarget } from '../references/citations.mjs';
import { declarationOwners, symbolOwner } from '../references/owners.mjs';
import { issue } from './notes.mjs';
import { declarationNames } from './declarations.mjs';

function citedUnits(source,symbol,context){
  const names=declarationOwners(source).names;
  const qualified=names.has(symbol)?[symbol]:[...names].filter(name=>name.endsWith(`.${symbol}`));
  if(qualified.length!==1)return [];
  const root=qualified[0].split('.')[0];
  return context.units.filter(unit=>unit.path===source.path&&declarationNames(unit.node).includes(root));
}

function commentKey(comment, unit, context, identity) {
  let text = comment.text;
  const references = extractReferences(text).filter(reference => reference.symbol);
  for (const reference of references.reverse()) {
    const target = referenceTarget(reference, unit.path, context.files);
    if (target.paths?.length !== 1) continue;
    const source = context.parsed.get(target.paths[0]);
    if (!source || symbolOwner(declarationOwners(source), reference.symbol) !== 'present') continue;
    const owners = citedUnits(source,reference.symbol,context);
    if (owners.length !== 1 || !identity.has(owners[0])) continue;
    text = text.slice(0, reference.offset) + identity.get(owners[0]) + text.slice(reference.offset + reference.target.length);
  }
  return [comment.anchor, text];
}

export function commentChanges(pairs, base, head, identity) {
  const findings = [];
  const ancillaryChanges = [];
  for (const pair of pairs) {
    const before = pair.base.comments.map(comment => commentKey(comment, pair.base, base, identity));
    let after = pair.head.comments.map(comment => commentKey(comment, pair.head, head, identity));
    const extra = after.length - before.length;
    if (extra > 0 && pair.head.order === 0 && !base.files.has(pair.head.path)
      && after.slice(0, extra).every(([anchor]) => anchor === 0)) {
      ancillaryChanges.push({ path: pair.head.path, kind: 'added-file-header', comments: extra });
      after = after.slice(extra);
    }
    if (JSON.stringify(before) !== JSON.stringify(after)) findings.push(issue('move-comments', pair.head, 'Owned comment bytes or token-relative positions changed.'));
  }
  return { findings, ancillaryChanges };
}
