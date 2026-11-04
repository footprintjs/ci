import { readBlobs } from '../blobs.mjs';

export function attributeTree(repo,commit,entries){
  const files=entries.filter(entry=>/(?:^|\/)\.gitattributes$/.test(entry.path));
  const regular=files.filter(file=>file.type==='blob'&&['100644','100755'].includes(file.mode));
  let texts=new Map(),failure=null;
  try{texts=readBlobs(repo,regular);}catch{failure='Attribute text cannot be decoded within the snapshot input limits.';}
  return {id:commit.id,files:files.map(file=>({...file,text:texts.get(file.oid)??null,
    ...(failure?{reason:failure}:{})}))};
}
