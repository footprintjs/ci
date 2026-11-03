import assert from 'node:assert/strict';
import preparation from '../../src/guards/release-prepare.cjs';
import {createFoottracePreparationProfile} from '../../src/propose/foottrace-profile.mjs';
import {createRefreshInputReader} from '../../src/propose/refresh-inputs.mjs';
import {chainFixture} from './pending-chain-provider-fixture.mjs';
import {sourceFixture} from './prepared-fixtures.mjs';
export const PRIVATE='PRIVATE-NATIVE-ORDINARY-SOURCE';
export function ordinaryFixture({count=1,changeSource=()=>{},change=()=>{}}={}) {
 const pending=chainFixture(count,changeSource),currentSource=sourceFixture();currentSource.commit.sha='e'.repeat(40);
 changeSource(currentSource);currentSource.commit.tree.sha=preparation.treeOid(currentSource.inventory);
 const expected=createRefreshInputReader(createFoottracePreparationProfile())({pending,currentSource,currentPreparationDate:null});assert.equal(expected.valid,true);
 const sources=new Map([...pending.witnesses.map(w=>w.originalSource),currentSource].map(s=>[s.commit.sha,s]));
 const context={repository:{id:123,full_name:'footprintjs/foottrace'},sha:currentSource.commit.sha},calls=[];
 let mains=0;
 const api=async(method,route,body)=>{
  assert.equal(method,'GET');assert.equal(body,undefined);calls.push(route);let data;
  if(route.endsWith('/git/ref/heads/main')){mains++;data={object:{sha:context.sha,type:'commit'}};}
  else if(route.includes('/git/commits/')){const sha=route.split('/').at(-1),source=sources.get(sha);assert.ok(source);data={...structuredClone(source.commit),parents:[],private:PRIVATE};}
  else if(route.includes('/git/trees/')){
   const oid=route.split('/git/trees/')[1].split('?')[0],source=[...sources.values()].find(s=>s.commit.tree.sha===oid);assert.ok(source);
   data={sha:oid,truncated:false,tree:[...source.inventory].map(([path,row])=>({path,sha:row.sha,mode:row.mode,type:'blob'})),private:PRIVATE};
  }else if(route.includes('/git/blobs/')){
   const oid=route.split('/').at(-1),row=[...sources.values()].flatMap(s=>[...s.inventory.values()]).find(row=>row.sha===oid);assert.ok(row?.bytes);
   data={sha:oid,encoding:'base64',size:row.bytes.length,content:row.bytes.toString('base64'),private:PRIVATE};
  }else throw new Error('fixture-route');
  change(data,route,{mains});return {data};
 };
 return {api,context,prepared:expected,calls,sources,currentSource,pending};
}
