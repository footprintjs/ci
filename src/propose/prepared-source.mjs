import preparation from '../guards/release-prepare.cjs';
import changes from '../guards/release-changes.cjs';
import { jsonData } from '../eco/json-data.mjs';
import { own, keys, refuseSource, semanticText, snapshotSource } from './source-inventory.mjs';
const unavailable = () => Object.freeze({ valid: false, reason: 'prepared-source-unavailable' });
const FIELDS = ['package', 'fromVersion', 'version', 'bump', 'tag', 'notes', 'updates', 'deletions'];

/** A trusted package adapter is code supplied by the reviewed host, never a hook from config/record data.
 * Reconstruction is pure; its result establishes no published lineage, eligibility or effect authority.
 */
export function createPreparedSourceReader({ packageName, prepare, dateLaw }) {
  if (typeof prepare !== 'function' || typeof packageName !== 'string' || !packageName.length ||
      !['source-committer-day', 'native-evidence-day'].includes(dateLaw))
    throw new TypeError('prepared-source-adapter');
  return (source, preparationDate) => {
    try {
      const basis = snapshotSource(source), { inventory } = basis;
      let date = basis.date;
      if (dateLaw === 'native-evidence-day') {
        if (typeof preparationDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(preparationDate) ||
            new Date(preparationDate + 'T00:00:00Z').toISOString().slice(0, 10) !== preparationDate) refuseSource();
        date = preparationDate;
      } else if (preparationDate !== undefined && preparationDate !== null) refuseSource();
      const packageIdentity = (view) => {
        const pkg = JSON.parse(semanticText(view, 'package.json'));
        const lock = JSON.parse(semanticText(view, 'package-lock.json'));
        const version = own(pkg, 'version'), root = own(own(lock, 'packages'), '');
        preparation.parseVersion(version);
        if (own(pkg, 'name') !== packageName || own(lock, 'name') !== packageName ||
            own(lock, 'version') !== version || own(root, 'name') !== packageName ||
            own(root, 'version') !== version) refuseSource();
        return version;
      };
      const fromVersion = packageIdentity(inventory);
      const queue = preparation.fragmentQueue(inventory).map(row => Object.freeze({ ...row }));
      // The selected adapter gets an owned view, not the provider's mutable Map or buffers.
      const adapterInventory = new Map([...inventory].map(([path, row]) => [path,
        { ...row, ...(row.bytes ? { bytes: Buffer.from(row.bytes) } : {}) }]));
      const result = prepare({ inventory: adapterInventory, date });
      keys(result, FIELDS);
      const value = Object.fromEntries(FIELDS.map(key => [key, own(result, key)]));
      preparation.parseVersion(value.fromVersion); preparation.parseVersion(value.version);
      if (value.package !== packageName || value.fromVersion !== fromVersion ||
          !['patch', 'minor', 'major'].includes(value.bump) || value.tag !== `v${value.version}` ||
          typeof value.notes !== 'string' || Buffer.byteLength(value.notes) > 128 * 1024 * 1024) refuseSource();
      const bump = changes.selectBump(queue.map(row =>
        changes.parseFragment(row.path.slice(9), semanticText(inventory, row.path))));
      if (value.bump !== bump || value.version !== changes.nextVersion(fromVersion, bump)) refuseSource();
      const updateNames = Reflect.ownKeys(value.updates), updates = Object.create(null);
      if (updateNames.length > 4096) refuseSource();
      let total = 0;
      const candidate = new Map(inventory);
      for (const path of updateNames) {
        if (typeof path !== 'string') refuseSource();
        const text = own(value.updates, path);
        if (typeof text !== 'string' || Buffer.byteLength(text) > 2 * 1024 * 1024) refuseSource();
        const bytes = Buffer.from(text); total += bytes.length;
        if (total > 128 * 1024 * 1024) refuseSource();
        updates[path] = text;
        candidate.set(path, { mode: '100644', sha: preparation.gitObject('blob', bytes), bytes });
      }
      const rawDeletions = jsonData(value.deletions);
      if (!Array.isArray(rawDeletions) || rawDeletions.length > 100) refuseSource();
      const deletions = [];
      for (const path of rawDeletions) {
        if (typeof path !== 'string' || deletions.includes(path) || !candidate.has(path) ||
            Object.hasOwn(updates, path)) refuseSource();
        deletions.push(path); candidate.delete(path);
      }
      // Ordinary next-version preparation consumes exactly the original raw queue.
      if (JSON.stringify([...deletions].sort()) !== JSON.stringify(queue.map(row => row.path).sort())) refuseSource();
      if (packageIdentity(candidate) !== value.version) refuseSource();
      const tree = preparation.treeOid(candidate);
      return Object.freeze({ valid: true, sourceSha: basis.sourceSha, sourceTree: basis.sourceTree, date,
        tree, queue: Object.freeze(queue), prepared: Object.freeze({ ...value,
          updates: Object.freeze(updates), deletions: Object.freeze(deletions) }) });
    } catch { return unavailable(); }
  };
}
