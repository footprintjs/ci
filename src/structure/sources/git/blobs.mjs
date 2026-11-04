import { gitBytes } from './process.mjs';
import { needsText } from './trees.mjs';

export function readBlobs(repo, entries) {
  const ids = [...new Set(entries.filter(entry => needsText(entry.path)).map(entry => entry.oid))];
  if (!ids.length) return new Map();
  const bytes = gitBytes(repo, ['cat-file', '--batch'], ids.join('\n') + '\n');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const texts = new Map();
  let offset = 0;
  for (const oid of ids) {
    const end = bytes.indexOf(10, offset);
    const header = bytes.subarray(offset, end).toString('ascii').split(' ');
    if (end < 0 || header[0] !== oid || header[1] !== 'blob' || !/^\d+$/.test(header[2])) {
      throw new Error('Invalid Git blob protocol.');
    }
    const size = Number(header[2]);
    if (!Number.isSafeInteger(size) || size > 8 * 1024 * 1024) throw new Error('Text blob exceeds the 8 MiB input limit.');
    offset = end + 1;
    if (offset + size >= bytes.length || bytes[offset + size] !== 10) throw new Error('Truncated Git blob.');
    texts.set(oid, decoder.decode(bytes.subarray(offset, offset + size)));
    offset += size + 1;
  }
  if (offset !== bytes.length) throw new Error('Unexpected trailing Git blob output.');
  return texts;
}
