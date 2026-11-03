import native from '../guards/release-github.cjs';
import {jsonData} from '../eco/json-data.mjs';
/** Logical App lookup from ONE previously verified key-holder observation.
 * There is no JWT/private key or private-App request in this process. Shape is
 * not self-authentication; actual reviewed helper-to-capture/source binding is
 * independently required. Repository acquisitions remain token-scoped/bounded.
 */
export function createAppIdentityApi({token,facts,settings,fetchBounded}){
 const api=native.makeApi(token,fetchBounded),fail=()=>{throw new Error('inspection-app-unavailable');};
 return async(method,route,body)=>{
  if(typeof route==='string'&&route.startsWith('/apps/')){
   if(method!=='GET'||route!=='/apps/'+settings.slug||body!==undefined)fail();
   return {data:jsonData({id:facts.appId,slug:facts.appSlug,client_id:facts.clientId,
    owner:{id:facts.ownerId,login:facts.ownerLogin,type:facts.ownerType}})};
  }
  if(typeof route==='string'&&(route==='/app'||route.startsWith('/app/')))fail();
  return api(method,route,body);
 };
}
