import { moduleModel } from './module.mjs';
import { publishedScope,nestedPackagePath } from './public-scope.mjs';
import { unknown } from './notes.mjs';

function exportsNames(context,path){
  const model=moduleModel(context,path);
  return model.exports.size>0||model.stars.length>0;
}

function rootEntry(path){return /^src\/index\.[cm]?[jt]sx?$/.test(path);}

function nestedPublication(context,other){
  return [...context.parsed.keys()].filter(path=>context.files.get(path)?.text!==other.files.get(path)?.text&&nestedPackagePath(context,path))
    .map(path=>unknown('move-door-privacy',{path},'Root package closure does not prove entry routing inside a tracked nested package.'));
}

export function comparedDoors(base,head){
  const before=publishedScope(base),after=publishedScope(head);
  const paths=new Set([...base.doors.paths,...before.paths,...after.paths]);
  const unverified=[...before.reasons,...after.reasons].map(reason=>unknown('move-door-privacy',{path:'package.json'},reason));
  unverified.push(...nestedPublication(base,head),...nestedPublication(head,base));
  for(const path of head.doors.paths){
    if(base.files.has(path)||after.paths.has(path)||rootEntry(path)){paths.add(path);continue;}
    if(!after.closed)unverified.push(unknown('move-door-privacy',{path},'A new shape-only facade has no proven closed private package scope.'));
  }
  for(const path of base.parsed.keys()){
    if(!exportsNames(base,path))continue;
    if(head.parsed.has(path)){paths.add(path);continue;}
    if(!paths.has(path)&&!before.closed)unverified.push(unknown('move-door-privacy',{path},'A deleted internal module has no proven closed private package scope.'));
  }
  return {paths,unverified};
}
