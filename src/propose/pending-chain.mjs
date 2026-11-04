import { isDeepStrictEqual } from 'node:util';
import preparation from '../guards/release-prepare.cjs';
import { fields, jsonData } from '../eco/json-data.mjs';
import { own, keys, refuseSource } from './source-inventory.mjs';
import { createPreparationWitnessReader } from './preparation-witness.mjs';
import { packageProfile } from './package-profile.mjs';
const unavailable = (reason = 'pending-chain-unavailable') => Object.freeze({ valid: false, reason });

/** Oldest first, at most eight independently bound preparation witnesses.
 * This binds prepared inputs and pending parents only. Published lineage, source ancestry,
 * retained native eligibility, current App/run identity and effect permission remain separate.
 */
export function createPendingPreparationChainReader(inputProfile) {
  const profile = packageProfile(inputProfile), read = createPreparationWitnessReader(profile);
  return input => {
    try {
      keys(input, ['witnesses', 'predecessor']);
      const raw = own(input, 'witnesses'), length = own(raw, 'length');
      if (!Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype ||
          !Number.isSafeInteger(length) || length < 1) refuseSource();
      if (length > 8) return unavailable('pending-chain-hop-limit');
      if (Reflect.ownKeys(raw).length !== length + 1) refuseSource();
      const predecessor = fields(jsonData(own(input, 'predecessor')), ['pr', 'head', 'tree', 'merge']);
      const hops = [], identities = new Set(), producers = new Set();
      let pendingParent = profile.originalParentLaw === 'source-only' ? null : predecessor.head, previous;
      for (let i = 0; i < length; i++) {
        const hop = read(own(raw, String(i)));
        if (!hop.valid || !isDeepStrictEqual(hop.predecessor, predecessor) ||
            hop.pendingParent !== pendingParent || identities.has(hop.pendingSha)) refuseSource();
        if (previous && (previous.binding.repositoryId !== hop.binding.repositoryId ||
            previous.binding.package !== hop.binding.package || previous.fromVersion !== hop.fromVersion)) refuseSource();
        const producer = `${hop.binding.repositoryId}/${hop.binding.runId}/${hop.binding.runAttempt}`;
        if (producers.has(producer)) refuseSource();
        if (previous) preparation.requireQueueSubset(previous.queue, hop.queue);
        producers.add(producer);
        identities.add(hop.pendingSha); hops.push(hop);
        pendingParent = hop.pendingSha; previous = hop;
      }
      return Object.freeze({ valid: true, scope: 'pending-chain-inputs-only', predecessor,
        pendingSha: previous.pendingSha, pendingTree: previous.pendingTree, hops: Object.freeze(hops) });
    } catch { return unavailable(); }
  };
}
