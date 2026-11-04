import { createHash } from 'node:crypto';
import { sourceComments } from '../references/comments.mjs';

function residual(context,path){
  const source=context.parsed.get(path);
  if(!source)return [];
  const owned=new Set(context.units.filter(unit=>unit.path===path).flatMap(unit=>unit.comments.map(comment=>comment.offset)));
  return sourceComments(source).filter(comment=>!owned.has(comment.offset)).map(comment=>comment.text);
}

export function residualComments(base,head){
  const changes=[];
  const hash=comments=>createHash('sha256').update(JSON.stringify(comments)).digest('hex');
  for(const path of new Set([...base.parsed.keys(),...head.parsed.keys()])){
    const before=residual(base,path),after=residual(head,path);
    if(JSON.stringify(before)!==JSON.stringify(after))changes.push({path,kind:'wiring-or-file-comments',
      before:hash(before),after:hash(after),beforeCount:before.length,afterCount:after.length});
  }
  return changes;
}
