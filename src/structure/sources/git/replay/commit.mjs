import { gitBytes } from '../process.mjs';

export function commitInput(repo,revision){
  if(typeof revision!=='string'||!revision||revision.startsWith('-')||/[\0\r\n]/.test(revision))throw new TypeError('Invalid merge commit revision.');
  const id=gitBytes(repo,['rev-parse','--verify','--end-of-options',`${revision}^{commit}`]).toString('utf8').trim();
  if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(id))throw new Error('Invalid merge commit id.');
  const bytes=gitBytes(repo,['cat-file','commit',id]);
  const end=bytes.indexOf(Buffer.from('\n\n'));
  if(end<0)throw new Error('Invalid raw merge commit header.');
  const header=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,end));
  const trees=header.split('\n').filter(line=>line.startsWith('tree ')).map(line=>line.slice(5));
  const parents=header.split('\n').filter(line=>line.startsWith('parent ')).map(line=>line.slice(7));
  if(trees.length!==1||[...trees,...parents].some(value=>!new RegExp(`^[a-f0-9]{${id.length}}$`).test(value))){
    throw new Error('Invalid raw merge tree or parent ids.');
  }
  return {id,tree:trees[0],parents};
}
