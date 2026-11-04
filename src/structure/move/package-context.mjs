import { posix } from 'node:path';

/** Tracked package ancestry only; no npm resolution or configuration execution. */
export function packageContext(context,path){
  const packages=[];
  const reasons=[];
  for(let directory=posix.dirname(path);;directory=posix.dirname(directory)){
    const target=directory==='.'?'package.json':`${directory}/package.json`;
    const file=context.files.get(target);
    if(file){
      packages.push([target,file.text]);
      try{
        const manifest=JSON.parse(file.text);
        if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))reasons.push('Tracked package metadata is not an object.');
      }catch{reasons.push('Tracked package metadata cannot be read as JSON.');}
    }
    if(directory==='.')break;
  }
  return {identity:JSON.stringify(packages),reasons};
}
