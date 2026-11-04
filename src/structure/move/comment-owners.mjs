function endingAfter(statements,position){
  let low=0,high=statements.length;
  while(low<high){const middle=(low+high)>>>1;if(statements[middle].end<=position)low=middle+1;else high=middle;}
  return low;
}

function ownerOf(comment,statements,source){
  const index=endingAfter(statements,comment.offset);
  const next=statements[index],previous=statements[index-1];
  if(next&&comment.offset>=next.start)return next.node;
  const tail=previous&&source.text.slice(previous.end,comment.offset);
  if(previous&&!tail.includes('\n')&&!tail.trim())return previous.node;
  return next&&comment.offset>=next.fullStart&&comment.offset<next.start?next.node:null;
}

/** Partition once per source, including unique same-line trailing ownership. */
export function commentOwners(source,comments){
  const statements=[...source.sourceFile.statements].map(node=>({node,start:node.getStart(source.sourceFile),
    end:node.getEnd(),fullStart:node.getFullStart()}));
  const owners=new Map();
  for(const comment of comments){
    const node=ownerOf(comment,statements,source);
    if(!node)continue;
    if(!owners.has(node))owners.set(node,[]);
    owners.get(node).push(comment);
  }
  return owners;
}
