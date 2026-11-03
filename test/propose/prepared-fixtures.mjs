import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), preparation = require('../../src/guards/release-prepare.cjs');
const raw = { 'package.json': '{"name":"foottrace","version":"1.10.0"}\n',
  'package-lock.json': '{"name":"foottrace","version":"1.10.0","packages":{"":{"name":"foottrace","version":"1.10.0"}}}\n',
  'CHANGELOG.md': '# Changelog\n\nPrior notes.\n', 'README.md': '# Fixture\n', 'docs/metadata.md': 'Fixture docs.\n',
  '.changes/first.md': '---\ntype: fixed\nbump: patch\n---\n\n- First fixture change.\n' };
export function sourceFixture() {
  const inventory = new Map(Object.entries(raw).map(([path,text]) => {
    const bytes = Buffer.from(text); return [path,{mode:'100644',sha:preparation.gitObject('blob',bytes),bytes}];
  }));
  // A complete Git identity does not require downloading a semantically irrelevant source blob.
  inventory.set('src/unchanged.ts',{mode:'100644',sha:'d'.repeat(40)});
  return { commit:{sha:'a'.repeat(40),tree:{sha:preparation.treeOid(inventory)},committer:{date:'2026-11-02T01:00:00Z'}},inventory };
}
export function prepareFixture({ inventory, date }) {
  const files={},fragments={};
  for (const path of ['package.json','package-lock.json','CHANGELOG.md','README.md','docs/metadata.md']) files[path]=preparation.decodeRaw(inventory.get(path).bytes);
  for (const row of preparation.fragmentQueue(inventory)) fragments[row.path.slice(9)]=preparation.decodeRaw(inventory.get(row.path).bytes);
  return preparation.prepareRelease({files,fragments,date});
}
