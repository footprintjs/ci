import {isOpaqueCredential} from '../http-credential.cjs';
import { jsonData, fields, id, text } from '../eco/json-data.mjs';
import { own } from './source-inventory.mjs';
import { createGitHubTransport } from './github-transport.mjs';
import { bindProposalMetadata } from './proposal-metadata-payload.mjs';
import {bindProposalEffectRequest} from './proposal-effect-request.mjs';
import {createAppIdentityApi} from './app-identity-api.mjs';
import {bindAppIdentityFacts} from './app-identity-facts.mjs';
const transports = new WeakMap();
const fail = () => { throw new Error('foottrace-transport-unavailable'); };
/** Runtime-only private native API closure. Its read facet remains GET-only;
 * a separate closed exact-PATCH facet is IO, never a writer grant. No saved/model
 * JSON can supply its opaque brand or code port.
 */
export function createFoottraceTransport(options={}){
 return createNativeOwner(options,false);
}
/** Separate least-privilege inspection profile; no writer facet is derivable. */
export function createFoottraceInspectionTransport(options={}){
 return createNativeOwner(options,true);
}
function createNativeOwner({repository,token,appIdentity,fetcher,limits},inspectionReadOnly){
 const repo=fields(jsonData(repository),['id','full_name']);id(repo.id);
 if(repo.full_name!=='footprintjs/foottrace'||!isOpaqueCredential(token))fail();
 // Both profiles accept only the isolated key holder's public facts.
 const identity=fields(jsonData(appIdentity,4096),['slug','clientId','facts']);
 const slug=text(identity.slug,/^[a-z0-9-]+$/,100),clientId=text(identity.clientId,/^[A-Za-z0-9_.-]+$/,128);
 const settings=jsonData({slug,clientId}),facts=bindAppIdentityFacts(identity.facts,{repository:repo,slug,clientId});
 return registerOwner({repository:repo,settings,facts,fetcher,limits,inspectionReadOnly,
  makeApi:fetchBounded=>createAppIdentityApi({token,facts,settings,fetchBounded})});
}

function registerOwner({repository,settings,facts,fetcher,limits,inspectionReadOnly,makeApi}){
 const http=createGitHubTransport({repository,fetcher,limits});
 const value=Object.freeze({scope:inspectionReadOnly?'captured-native-read-owner':'captured-native-http-owner'});
 transports.set(value,{http,repository,settings,facts,inspectionReadOnly,makeApi});
 return value;
}

/** Trusted code-only lookup. Exposes bounded native GET functions and owned
 * public facts, never the credential, key or signed download URL.
 */
export function foottraceTransportPort(transport, limits) {
  const value = transports.get(transport); if (!value) fail();
  const view = value.http.createView(limits);
  return Object.freeze({ api: value.makeApi(view.fetch), repository: value.repository, settings: value.settings,
    registry: version => value.http.createRegistryView({ packageName: 'foottrace', version, ...(limits === undefined ? {} : { limits }) }).fetch,
    facts: view.facts, transportFacts: value.http.facts, inspectionReadOnly:value.inspectionReadOnly,
    identityFacts:value.facts,identityObservation:'cached-key-holder-facts' });
}

/** Trusted CODE-only exact metadata IO from the SAME captured credential owner.
 * No raw API/fetch, fresh client, credential or saved authority is returned.
 * Full native eligibility/writer admission and committed pre-effect/rechecks
 * remain the domain controller's responsibility before calling setExact().
 */
export function foottraceMetadataPatchPort(transport, input) {
  const value = transports.get(transport); if (!value||value.inspectionReadOnly) fail();
  try {
    const binding = jsonData(input, 128 * 1024);
    fields(binding, Object.hasOwn(binding, 'limits') ? ['pullNumber', 'desired', 'limits'] : ['pullNumber', 'desired']);
    id(binding.pullNumber);
    const exact = bindProposalMetadata(binding.desired, true),
      payload = Object.freeze({ title: exact.title, body: exact.body }),
      view = value.http.createExactPatchView(binding), api = value.makeApi(view.fetch),
      route = '/repos/' + value.repository.full_name + '/pulls/' + binding.pullNumber;
    return Object.freeze({ scope: 'exact-metadata-io-only', authorized: false,
      setExact: () => submit(value,api,'PATCH',route,payload), observation:view.observation, facts: view.facts, transportFacts: value.http.facts });
  } catch { fail(); }
}

// A failed/uncertain submission never opens another mutation on this owner.
// GET verification stays available; cross-invocation history is independently
// admitted by the native flow, never remembered or granted here.
async function submit(owner,api,method,route,payload){
 try{return await api(method,route,payload);}
 catch(error){owner.http.haltWrites();throw error;}
}
/** Closed nonforce native IO only, not a domain admission or effect grant.
 * Exact singleton tree/commit/ref/PR and per-content blob attempts share the
 * captured owner's budget and uncertainty stop. No raw API/fetch escapes.
 */
export function foottraceProposalEffectPort(transport,input){
 const value=transports.get(transport);if(!value||value.inspectionReadOnly)fail();
 try{
  const spec=bindProposalEffectRequest(value.repository,input);
  const view=value.http.createExactProposalEffectView(spec.binding),api=value.makeApi(view.fetch);
  return Object.freeze({scope:'exact-proposal-effect-io-only',authorized:false,
   submit:()=>submit(value,api,spec.method,spec.route,spec.payload),
   observation:view.observation,facts:view.facts,transportFacts:value.http.facts});
 }catch{fail();}
}
