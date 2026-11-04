import { moduleModel } from './module.mjs';
import { publishedScope } from './public-scope.mjs';
import { unknown } from './notes.mjs';

function exportsNames(context,path){
  const model=moduleModel(context,path);
  return model.exports.size>0||model.stars.length>0;
}

function rootEntry(path){return /^src\/index\.[cm]?[jt]sx?$/.test(path);}

export function comparedDoors(base,head){
  const before=publishedScope(base),after=publishedScope(head);
  const paths=new Set([...base.doors.paths,...before.paths,...after.paths]);
  const unverified=[...before.reasons,...after.reasons].map(reason=>unknown('move-door-privacy',{path:'package.json'},reason));
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
