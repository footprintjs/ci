import {isDeepStrictEqual} from 'node:util';
import {bindProposalMetadata} from './proposal-metadata-payload.mjs';
import {own} from './source-inventory.mjs';
const fail=()=>{throw new Error('metadata-reply-unavailable');};
/** Shared exact response guard; a known inconsistency is never erased by GET. */
export function requireExactProposalMetadataReply(reply,expected,payload,repository){
 const data=own(reply,'data'),head=own(data,'head'),base=own(data,'base'),actor=own(data,'user');
 if(own(data,'number')!==expected.pr||own(data,'state')!=='open'||own(data,'merged')!==false||
  own(data,'auto_merge')!==null||own(data,'merged_at')!==null||
  own(actor,'id')!==expected.botId||own(actor,'type')!=='Bot'||own(head,'sha')!==expected.head||own(head,'ref')!=='release/next'||
  own(base,'sha')!==expected.observedBase||own(base,'ref')!=='main'||
  own(own(head,'repo'),'id')!==repository.id||own(own(base,'repo'),'id')!==repository.id||
  own(own(head,'repo'),'full_name')!==repository.full_name||own(own(base,'repo'),'full_name')!==repository.full_name||
  !isDeepStrictEqual(bindProposalMetadata(data),payload))fail();
}
