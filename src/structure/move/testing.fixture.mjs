export const snapshot = files => ({ files: Object.entries(files).map(([path, text]) => ({ path, text })) });

export function simpleMove() {
  const work = '/** Work docs. */\nfunction work(value) { return value + 1; }';
  const run = 'export function run(value) { return work(value); }';
  return { base: snapshot({ 'src/owner.ts': `${work}\n${run}`, 'src/index.ts': "export { run } from './owner.js';" }),
    head: snapshot({ 'src/owner.ts': `import { work } from './owner/work.js';\n${run}`,
      'src/owner/work.ts': work.replace('function work', 'export function work'),
      'src/index.ts': "export { run } from './owner.js';" }) };
}

export function changeFile(snapshot, path, change) {
  const file = snapshot.files.find(item => item.path === path);
  if (!file) throw new Error(`Missing fixture file ${path}`);
  file.text = change(file.text);
}
