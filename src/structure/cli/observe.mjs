import { readGitSnapshot } from '../sources/git/index.mjs';
import { verifyGitMerge } from '../sources/git/replay/index.mjs';
import { analyzeCommand } from './analyze.mjs';

export function observeCommand(options){
  if(options.command==='verify-merge')return verifyGitMerge(options.repo,options.head);
  const head=readGitSnapshot(options.repo,options.head);
  const base=options.base?readGitSnapshot(options.repo,options.base):undefined;
  return analyzeCommand(options.command,head,base);
}
