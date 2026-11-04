/** Prefix count over parser-ordered tokens; starts are strict, ends inclusive. */
export function tokenPrefixCount(tokens,position,edge){
  let low=0,high=tokens.length;
  while(low<high){
    const middle=(low+high)>>>1;
    const before=edge==='end'?tokens[middle].end<=position:tokens[middle].start<position;
    if(before)low=middle+1;else high=middle;
  }
  return low;
}
