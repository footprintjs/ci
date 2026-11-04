import {id} from '../eco/json-data.mjs';
import {own} from './source-inventory.mjs';
import {requireExactProposalMetadataReply} from './proposal-metadata-reply.mjs';
/** SAME exact App/metadata/PR response predicate for returned and observed PRs.
 * This predicate checks INPUT. Only the owning native submission may assign ACK.
 */
export function requireExactCreatedProposalReply(reply,{pr,head,base,botId,botLogin,repository,payload}){
 const data=own(reply,'data'),number=id(own(data,'number'));
 requireExactProposalMetadataReply(reply,{pr:pr===null?number:pr,head,observedBase:base,botId},payload,repository);
 if(own(own(data,'user'),'login')!==botLogin)throw new Error('created-proposal-unavailable');
 return number;
}
