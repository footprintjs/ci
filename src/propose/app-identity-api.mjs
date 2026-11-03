import native from '../guards/release-github.cjs';
import {isOpaqueCredential} from '../http-credential.cjs';
import {id,jsonData} from '../eco/json-data.mjs';
/** Fixed App identity adapter for both native profiles. The short-lived App JWT is used only
 * for GET /app; other operations use the installation token through its bounded profile.
 * No private key/signing API or token-mint route is exposed by this adapter.
 * The JWT is still an App credential; routing is cooperative CODE confinement,
 * not a claim that the JWT itself has a read-only permission scope. GitHub
 * verifies it; its opaque bytes are never treated as local proof.
 */
export function createAppIdentityApi({token,jwt,settings,fetchBounded}){
 if(!isOpaqueCredential(jwt))throw new Error('inspection-app-unavailable');
 const api=native.makeApi(token,fetchBounded),fail=()=>{throw new Error('inspection-app-unavailable');};
 return async(method,route,body)=>{
  if(typeof route==='string'&&route.startsWith('/apps/')){
   try{
    if(method!=='GET'||route!=='/apps/'+settings.slug||body!==undefined)fail();
    const response=await fetchBounded('https://api.github.com/app',{method:'GET',redirect:'error',
     headers:{authorization:'Bearer '+jwt,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'}});
    if(response.status!==200||!response.ok||!response.headers.get('content-type')?.includes('json'))fail();
    // The same owned transport has already bounded these bytes before buffering.
    const value=jsonData(JSON.parse(Buffer.from(await response.arrayBuffer()).toString('utf8')));
    if(value.slug!==settings.slug||value.client_id!==settings.clientId)fail();id(value.id);
    return {data:{id:value.id,slug:value.slug,client_id:value.client_id}};
   }catch{fail();}
  }
  return api(method,route,body);
 };
}
