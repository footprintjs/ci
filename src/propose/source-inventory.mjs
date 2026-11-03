import preparation from '../guards/release-prepare.cjs';
import control from '../guards/release-control.cjs';
import { jsonData } from '../eco/json-data.mjs';

export function refuseSource() { throw new Error('prepared-source-unavailable'); }
export function own(value, key) {
  if (!value || typeof value !== 'object') refuseSource();
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return undefined;
  if (!Object.hasOwn(descriptor, 'value')) refuseSource();
  return descriptor.value;
}
export function keys(value, allowed, maximum = allowed.length) {
  const names = Reflect.ownKeys(value);
  if (names.length > maximum || names.some(key => typeof key !== 'string' || !allowed.includes(key))) refuseSource();
  return names;
}
/** Backend-owned immutable Git inventory: complete path/OID/mode identity, selective semantic bytes.
 * Same fixed entry/blob/byte limits as the existing source reader. No target helpers execute.
 */
export function snapshotSource(source) {
  keys(source, ['commit', 'inventory']);
  const commit = jsonData(own(source, 'commit'));
  if (!control.validSha(commit.sha) || !control.validSha(commit.tree?.sha) ||
      typeof commit.committer?.date !== 'string') refuseSource();
  const date = new Date(commit.committer.date).toISOString().slice(0, 10);
  const input = own(source, 'inventory'), inventory = new Map(); let total = 0;
  for (const [path, entry] of Map.prototype.entries.call(input)) {
    if (inventory.size >= 4096 || typeof path !== 'string') refuseSource();
    keys(entry, ['sha', 'mode', 'bytes']);
    const sha = own(entry, 'sha'), mode = own(entry, 'mode'), raw = own(entry, 'bytes');
    if (!control.validSha(sha) || !['100644', '100755'].includes(mode)) refuseSource();
    const row = { sha, mode };
    if (raw !== undefined) {
      if (!Buffer.isBuffer(raw) || !ArrayBuffer.isView(raw) || raw.length > 2 * 1024 * 1024) refuseSource();
      const bytes = Buffer.from(raw); total += bytes.length;
      if (total > 128 * 1024 * 1024 || preparation.gitObject('blob', bytes) !== sha) refuseSource();
      row.bytes = bytes;
    }
    inventory.set(path, row);
  }
  if (preparation.treeOid(inventory) !== commit.tree.sha) refuseSource();
  return { sourceSha: commit.sha, sourceTree: commit.tree.sha, date, inventory };
}
export function semanticText(inventory, path) {
  const row = inventory.get(path);
  if (!row || row.mode !== '100644') refuseSource();
  return preparation.decodeRaw(row.bytes);
}
