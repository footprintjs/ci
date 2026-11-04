import { gitBytes } from '../process.mjs';
import { posix } from 'node:path';

export function replayEntries(repo,tree){
  if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(tree))throw new TypeError('Invalid replay tree id.');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(gitBytes(repo,['ls-tree','-r','-t','-z','--full-tree',tree]));
  const records=text.split('\0');
  if(records.pop()!=='')throw new Error('Replay tree output is truncated.');
  const entries=records.map(record=>{
    const match=/^(040000|100644|100755|120000|160000) (tree|blob|commit) ([a-f0-9]{40}|[a-f0-9]{64})\t([\s\S]+)$/.exec(record);
    if(!match)throw new Error('Invalid replay tree entry.');
    const [,mode,type,oid,path]=match;
    return {path,mode,type,oid};
  });
  const parents=new Set(entries.map(entry=>posix.dirname(entry.path)));
  return entries.filter(entry=>entry.type!=='tree'||!parents.has(entry.path));
}
