import {isDeepStrictEqual} from 'node:util';
// Compare identity only AFTER the owning native reader/binding validates all
// fields and observation bounds. Diagnostics remain in their original record;
// neither a shorter trace nor a read count supplies eligibility or authority.
function without(value,key){
 const facts={};
 for(const [name,field] of Object.entries(value))if(name!==key)facts[name]=field;
 return facts;
}
export const sameLineageFacts=(left,right)=>
 isDeepStrictEqual(without(left,'observations'),without(right,'observations'));
export const sameInspectionFacts=(left,right)=>
 isDeepStrictEqual(without(left,'count'),without(right,'count'));
