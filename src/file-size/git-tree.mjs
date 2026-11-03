import { execFileSync } from 'node:child_process';

const git = (repo, args, input) => execFileSync('git', ['-C', repo, ...args],
  { input, maxBuffer: 128 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
const decode = (bytes) => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
export function lineCount(bytes) {
  let count = 0;
  for (const byte of bytes) if (byte === 10) count++;
  return count + (bytes.length > 0 && bytes.at(-1) !== 10 ? 1 : 0);
}

// Read committed blobs, never execute or follow symlinks in a candidate checkout.
export function readTree(repo, ref) {
  if (ref !== 'HEAD' && !/^[a-f0-9]{40}$/.test(ref)) throw new Error('file-size base must be a full commit SHA');
  git(repo, ['rev-parse', '--verify', `${ref}^{commit}`]);
  const rows = decode(git(repo, ['ls-tree', '-rz', '--full-tree', ref, '--', 'src/', '.file-size-baseline.json']))
    .split('\0').filter(Boolean).map((row) => {
      const tab = row.indexOf('\t');
      const [mode, type, oid] = row.slice(0, tab).split(' ');
      if (type !== 'blob' || !['100644', '100755'].includes(mode))
        throw new Error(`file-size requires regular tracked files: ${row.slice(tab + 1)}`);
      return { path: row.slice(tab + 1), oid };
    });
  const payload = rows.length ? git(repo, ['cat-file', '--batch'], rows.map((row) => row.oid).join('\n') + '\n') : Buffer.alloc(0);
  let offset = 0;
  const files = {};
  let baseline = null;
  for (const row of rows) {
    const end = payload.indexOf(10, offset);
    const [oid, type, sizeText] = payload.subarray(offset, end).toString('ascii').split(' ');
    const size = Number(sizeText);
    if (oid !== row.oid || type !== 'blob' || !Number.isSafeInteger(size) || size < 0 || end < offset || end + size + 1 >= payload.length)
      throw new Error('file-size Git blob framing failed');
    const bytes = payload.subarray(end + 1, end + 1 + size);
    offset = end + size + 2;
    if (row.path === '.file-size-baseline.json') baseline = JSON.parse(decode(bytes));
    else files[row.path] = lineCount(bytes);
  }
  if (offset !== payload.length) throw new Error('file-size Git blob framing failed');
  return { files, baseline };
}
