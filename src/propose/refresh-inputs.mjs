import preparation from '../guards/release-prepare.cjs';
import { packageProfile } from './package-profile.mjs';
import { createPendingPreparationChainReader } from './pending-chain.mjs';
import { createPreparedSourceReader } from './prepared-source.mjs';
import { own, keys } from './source-inventory.mjs';
const unavailable = () => Object.freeze({ valid: false, reason: 'refresh-inputs-unavailable' });

/** Prepared data for the backend, never tracked scope or a decision to mutate.
 * No source-ancestry/current-ref/published-lineage or retained-eligibility claim is made.
 * The native flow must admit and recheck those observations before each effect.
 */
export function createRefreshInputReader(inputProfile) {
  const profile = packageProfile(inputProfile), readPending = createPendingPreparationChainReader(profile);
  const readPrepared = createPreparedSourceReader({ packageName: profile.packageName,
    prepare: profile.prepare, dateLaw: profile.dateLaw });
  return input => {
    try {
      keys(input, ['pending', 'currentSource', 'currentPreparationDate']);
      const pending = readPending(own(input, 'pending'));
      if (!pending.valid) return pending;
      const current = readPrepared(own(input, 'currentSource'), own(input, 'currentPreparationDate'));
      if (!current.valid || pending.hops.some(hop => hop.pendingSha === current.sourceSha)) return unavailable();
      const prior = pending.hops.at(-1);
      preparation.requireQueueSubset(prior.queue, current.queue);
      if (prior.fromVersion !== current.prepared.fromVersion) return unavailable();
      const samePreparation = current.sourceSha === prior.sourceSha && current.sourceTree === prior.sourceTree &&
        current.tree === prior.pendingTree && current.prepared.version === prior.binding.version;
      return Object.freeze({ valid: true, scope: 'refresh-prepared-inputs-only', profileId: profile.id,
        sourceSha: current.sourceSha, sourceTree: current.sourceTree, pendingSha: pending.pendingSha,
        pendingTree: pending.pendingTree, predecessor: pending.predecessor, targetTree: current.tree,
        version: current.prepared.version, fromVersion: current.prepared.fromVersion,
        proposedParents: Object.freeze([current.sourceSha, pending.pendingSha]), samePreparation,
        preparationRefs: Object.freeze(pending.hops.map(hop => Object.freeze({
          profileId: hop.profileId, version: hop.binding.version, preparationDate: hop.preparationDate, sourceSha: hop.sourceSha, sourceTree: hop.sourceTree,
          pendingSha: hop.pendingSha, pendingTree: hop.pendingTree, artifactDigest: hop.artifactDigest,
          producer: Object.freeze({ repositoryId: hop.binding.repositoryId, runId: hop.binding.runId,
            runAttempt: hop.binding.runAttempt, jobId: hop.binding.jobId, artifactId: hop.binding.artifactId }),
          predecessorRef: hop.predecessor, publishedLineageAdmitted: false,
        }))),
        queue: current.queue, prepared: current.prepared });
    } catch { return unavailable(); }
  };
}
