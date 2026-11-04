import { posix } from 'node:path';
import { moduleCaptures } from './module-context.mjs';
import { packageContext } from './package-context.mjs';
import { unknown } from './notes.mjs';
import { dynamicImportReasons } from './dynamic-imports.mjs';

export function environmentCoverage(pairs,base,head){
  const unverified=[];
  for(const pair of pairs.filter(item=>item.base.path!==item.head.path)){
    for(const reason of new Set([...dynamicImportReasons(pair.base,base),...dynamicImportReasons(pair.head,head)])){
      unverified.push(unknown('move-module-location',pair.head,reason));
    }
    for(const capture of new Set([...moduleCaptures(pair.base),...moduleCaptures(pair.head)])){
      unverified.push(unknown('move-module-context',pair.head,`Moved unit captures ${capture}; module environment equivalence is unproved.`));
    }
    if(posix.extname(pair.base.path)!==posix.extname(pair.head.path)){
      unverified.push(unknown('move-module-context',pair.head,'Source extension changed; compiler/module format is not inferred.'));
    }
    const before=packageContext(base,pair.base.path),after=packageContext(head,pair.head.path);
    const reasons=[...before.reasons,...after.reasons];
    if(before.identity!==after.identity)reasons.push('Tracked package ancestry changed; external binding/module environment equivalence is unproved.');
    for(const reason of reasons)unverified.push(unknown('move-package-context',pair.head,reason));
  }
  return unverified;
}
