import { own, keys } from './source-inventory.mjs';
const FIELDS = ['id', 'packageName', 'originalParentLaw', 'dateLaw', 'prepare', 'readHistoricalEvidence'];
/** Trusted host CODE boundary, never constructed from configuration or saved workflow data.
 * Each reviewed package adapter owns its actual native artifact/producer format. The shared
 * core still independently reconstructs source/queue/date/full tree and pending parent chain.
 */
export function packageProfile(input) {
  try {
    keys(input, FIELDS);
    const p = Object.fromEntries(FIELDS.map(key => [key, own(input, key)]));
    if (typeof p.id !== 'string' || !/^[a-z][a-z0-9-]{0,79}$/.test(p.id) ||
        typeof p.packageName !== 'string' || p.packageName.length > 214 ||
        !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(p.packageName) ||
        !['source-only', 'published-predecessor'].includes(p.originalParentLaw) ||
        !['source-committer-day', 'native-evidence-day'].includes(p.dateLaw) ||
        typeof p.prepare !== 'function' || typeof p.readHistoricalEvidence !== 'function') throw new Error();
    return Object.freeze(p);
  } catch { throw new TypeError('preparation-profile'); }
}
