import { commitInput } from './commit.mjs';
import { replayEntries } from './entries.mjs';
import { attributeTree } from './attributes.mjs';
import { nativeGit } from './process.mjs';
import { withReplayStore } from './store.mjs';
import { replayPreflight } from '../../../replay/preflight.mjs';
import { parseMergeOutput } from '../../../replay/output.mjs';
import { verifyMerge } from '../../../replay/index.mjs';

function mergeInput(repo,revision){
  const head=commitInput(repo,revision);
  const entries=replayEntries(repo,head.tree);
  const attributeTrees=[attributeTree(repo,head,entries)];
  if(head.parents.length===2)for(const id of head.parents){
    const parent=commitInput(repo,id);
    attributeTrees.push(attributeTree(repo,parent,replayEntries(repo,parent.tree)));
  }
  return {...head,entries,attributeTrees};
}

export function verifyGitMerge(repo,revision='HEAD'){
  const version=nativeGit(repo,['--version']);
  const head=mergeInput(repo,revision);
  const replay={version};
  if(replayPreflight(head,version).unverified.length)return verifyMerge({head,replay});
  return withReplayStore(repo,head.id.length,store=>{
    replay.mergeTree=nativeGit(store,['merge-tree','--write-tree','--name-only','--no-messages','-z',...head.parents]);
    const parsed=parseMergeOutput(replay.mergeTree,head.id.length);
    replay.entries=replayEntries(store,parsed.tree);
    return verifyMerge({head,replay});
  });
}
