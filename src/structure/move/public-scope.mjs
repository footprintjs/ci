import { codePath } from '../sources/paths.mjs';
import { packageSourcePath } from '../sources/package-paths.mjs';
import { posix } from 'node:path';

export function nestedPackagePath(context,path){
  for(let directory=posix.dirname(path);directory!=='.';directory=posix.dirname(directory)){
    const target=`${directory}/package.json`;
    if(context.files.has(target))return target;
  }
  return null;
}

function exportTargets(value,result){
  if(value===null)return;
  if(typeof value==='string'){
    if(value.includes('*'))result.reasons.push('Wildcard package targets do not prove a finite private surface.');
    else result.targets.add(value);
    return;
  }
  if(Array.isArray(value)){for(const item of value)exportTargets(item,result);return;}
  if(!value||typeof value!=='object'){result.reasons.push('Unsupported package export metadata.');return;}
  for(const [key,item]of Object.entries(value)){
    if(key.includes('*'))result.reasons.push('Wildcard package subpaths do not prove a finite private surface.');
    exportTargets(item,result);
  }
}

/** Closed tracked entry metadata only; no implicit deep-import or build routing guess. */
export function publishedScope(context){
  const file=context.files.get('package.json');
  if(!file)return {paths:new Set(),closed:false,reasons:[]};
  const manifest=JSON.parse(file.text);
  const result={targets:new Set(),reasons:[]};
  const declared=Object.hasOwn(manifest,'exports')&&manifest.exports!==null;
  if(declared)exportTargets(manifest.exports,result);
  for(const key of ['main','module','types','typings'])if(Object.hasOwn(manifest,key))exportTargets(manifest[key],result);
  const paths=new Set();
  for(const target of result.targets){
    const found=codePath(target)?packageSourcePath(target,context.files):{};
    if(found.path)paths.add(found.path);
    else result.reasons.push(found.reason??'Published target has no finite tracked code owner.');
  }
  return {paths,closed:declared&&!result.reasons.length,reasons:[...new Set(result.reasons)]};
}
