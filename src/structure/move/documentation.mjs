import { namedBindingOwner } from './binding-owner.mjs';
import { issue, unknown } from './notes.mjs';
import { moduleModel } from './module.mjs';

export function documentationNames(unit) {
  const names=[];
  let unsupported=false;
  for(const comment of unit.comments){
    for(const match of comment.text.matchAll(/\{@link(?:code|plain)?\s+([^}]+)\}/g)){
      const target=match[1].trim();
      if(/^https?:\/\//.test(target))continue;
      const parsed=/^([\w$]+)(?:[.#][\w$]+)*(?:\s+[^{}]*|\|[^{}]*)?$/.exec(target);
      if(parsed)names.push(parsed[1]);else unsupported=true;
    }
  }
  return {names,unsupported};
}

function documentedOwners(unit,context,identity){
  const links=documentationNames(unit);
  const owners=links.names.map(name=>namedBindingOwner(name,context,unit,identity));
  return {owners,unknown:links.unsupported||owners.some(owner=>!owner)};
}

export function documentationChanges(pairs,base,head,identity){
  const findings=[];
  const unverified=[];
  for(const pair of pairs){
    const before=documentedOwners(pair.base,base,identity);
    const after=documentedOwners(pair.head,head,identity);
    if(before.unknown||after.unknown)unverified.push(unknown('move-jsdoc-binding',pair.head,'JSDoc link ownership is unavailable in the admitted lexical grammar.'));
    else if(JSON.stringify(before.owners)!==JSON.stringify(after.owners))findings.push(issue('move-imports',pair.head,'JSDoc-only declaration binding changed.'));
    if(pair.base.path!==pair.head.path&&documentationNames(pair.head).names.some(name=>moduleModel(head,pair.head.path).imports.has(name))){
      unverified.push(unknown('move-jsdoc-emission',pair.head,'Moved imported JSDoc links need a separate emitted-declaration binding check; source imports may be elided.'));
    }
  }
  return {findings,unverified};
}
