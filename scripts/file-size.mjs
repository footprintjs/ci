import { resolve } from 'node:path';
import { checkFileSizes } from '../src/file-size/policy.mjs';
import { readTree } from '../src/file-size/git-tree.mjs';

try {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--repo' || args[2] !== '--base')
    throw new Error('usage: node scripts/file-size.mjs --repo <checkout> --base <full-commit-SHA>');
  if (!/^[a-f0-9]{40}$/.test(args[3])) throw new Error('file-size base must be a full commit SHA');
  const repo = resolve(args[1]);
  const current = readTree(repo, 'HEAD');
  const base = readTree(repo, args[3]);
  const result = checkFileSizes({ files: current.files, baseline: current.baseline, previous: base.baseline, before: base.files });
  for (const error of result.errors) console.error(error);
  console.log(`File-size ratchet: ${result.checked} source files, ${result.oversized} oversized baseline entries, ${result.errors.length} violations.`);
  if (result.errors.length) process.exitCode = 1;
} catch (error) {
  console.error(`File-size ratchet refused: ${error.message}`);
  process.exitCode = 1;
}
