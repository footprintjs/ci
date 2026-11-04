import { codePath } from '../sources/paths.mjs';
import { unknown } from './notes.mjs';

export function ancillaryChanges(base, head) {
  const changes = [];
  const unverified = [];
  for (const path of new Set([...base.files.keys(), ...head.files.keys()])) {
    const before = base.files.get(path);
    const after = head.files.get(path);
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    const oldMode=before?.mode??'100644',newMode=after?.mode??'100644';
    if(oldMode!==newMode){
      unverified.push(unknown('move-mode',{path},'File mode changed outside source token proof.'));
      changes.push({path,kind:'file-mode',before:oldMode,after:newMode});
    }
    if(codePath(path))continue;
    const documentation = /\.(?:md|markdown|mdx|rst|txt)$/.test(path);
    changes.push({ path, kind: documentation ? 'documentation' : 'metadata-or-asset',
      change: before && after ? 'modified' : before ? 'deleted' : 'added' });
    if (!documentation && path !== '.file-size-baseline.json') unverified.push(unknown('move-ancillary', { path }, 'Non-source metadata or asset semantics are outside whole-unit proof.'));
  }
  return { changes, unverified };
}
