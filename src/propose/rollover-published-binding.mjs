import {isDeepStrictEqual} from 'node:util';
import {jsonData} from '../eco/json-data.mjs';
const fail=()=>{throw new Error('ordinary-published-binding-unavailable');};
/** Actual freshly read published L facts, bound to this native INPUT baseline.
 * No retained-ref-L claim is made after the ref has moved to N.
 */
export function bindOrdinaryPublishedObservation(value,baseline){
 const p=baseline.prepared,r=baseline.rollover.reference;
 if(!value?.valid||value.scope!=='published-lineage-only'||value.authorized!==false||
  value.privateAppIdentityAdmitted!==false||value.sourceSha!==p.sourceSha||value.sourceTree!==p.sourceTree)fail();
 const actual=jsonData({predecessor:value.predecessor,version:value.version,tree:value.tree,archiveDigest:value.archiveDigest,producer:value.producer});
 const expected=jsonData({predecessor:r.predecessor,version:r.fromVersion,tree:r.predecessor.tree,archiveDigest:r.publishedArchiveDigest,producer:r.publishedProducer});
 if(!isDeepStrictEqual(actual,expected)||actual.version!==p.fromVersion)fail();
 return actual;
}
