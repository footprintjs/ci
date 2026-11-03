export const PRIVATE='PRIVATE-CANDIDATE-PROVIDER-BODY';
export function fixture({change=()=>{},registry=()=>null}={}) {
 const repository={id:123,full_name:'footprintjs/foottrace'},calls=[];
 const input={valid:true,version:'1.2.0',fromVersion:'1.1.0',preparationRefs:[{version:'1.1.1'}]};
 let phase=0;
 const api=async(method,route,body)=>{
  calls.push({method,route,body});let data;
  if(route.includes('/releases?')){phase++;data=[{id:40,tag_name:'v1.1.0',draft:false,prerelease:false,body:PRIVATE}];}
  else if(route.includes('/releases/40/assets?'))data=[{id:50,name:'publish-attempt-1.1.0.json',state:'uploaded',size:120,private:PRIVATE}];
  else if(route.includes('/git/ref/tags/')){const e=new Error(PRIVATE);e.status=404;throw e;}
  else throw new Error('fixture-route');
  change(data,route,{phase});return {data};
 };
 const readRegistry=async version=>{calls.push({method:'GET',registryVersion:version});return registry(version,phase);};
 return {candidateScope:'pending-chain',api,readRegistry,repository,packageName:'foottrace',nativeProfile:{markerPrefix:'publish-attempt-',tagPrefixes:['','v']},input,calls};
}
