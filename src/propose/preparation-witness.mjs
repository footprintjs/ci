import { isDeepStrictEqual } from 'node:util';
import control from '../guards/release-control.cjs';
import { fields, jsonData } from '../eco/json-data.mjs';
import { createPreparedSourceReader } from './prepared-source.mjs';
import { own, keys, snapshotSource } from './source-inventory.mjs';
import { packageProfile } from './package-profile.mjs';
const unavailable = () => Object.freeze({ valid: false, reason: 'historical-preparation-unavailable' });

/** Prepared-input binding only, through one explicit reviewed package adapter.
 * A shaped predecessor MUST separately pass native published-lineage admission. Neither
 * an adapter receipt nor the reconstructed tree grants eligibility or permission to act.
 */
export function createPreparationWitnessReader(inputProfile) {
  const profile = packageProfile(inputProfile), readPrepared = createPreparedSourceReader({
    packageName: profile.packageName, prepare: profile.prepare, dateLaw: profile.dateLaw });
  return input => {
    try {
      keys(input, ['evidence', 'originalSource', 'pendingSource', 'predecessor']);
      const native = jsonData(profile.readHistoricalEvidence(own(input, 'evidence')));
      if (native.valid !== true) return unavailable();
      fields(native, ['valid', 'binding', 'prepared', 'artifactDigest', 'preparationDate']);
      const binding = fields(native.binding, ['repositoryId', 'runId', 'runAttempt', 'jobId',
        'artifactId', 'sourceSha', 'tree', 'package', 'version']);
      if (!['repositoryId', 'runId', 'runAttempt', 'jobId', 'artifactId'].every(key =>
        Number.isSafeInteger(binding[key]) && binding[key] > 0) ||
          typeof native.artifactDigest !== 'string' || !/^[a-f0-9]{64}$/.test(native.artifactDigest)) return unavailable();
      const original = readPrepared(own(input, 'originalSource'), native.preparationDate);
      if (!original.valid || binding.sourceSha !== original.sourceSha || binding.tree !== original.sourceTree ||
          binding.package !== profile.packageName || binding.version !== original.prepared.version ||
          !isDeepStrictEqual(native.prepared, jsonData(original.prepared))) return unavailable();
      const pendingInput = own(input, 'pendingSource'), pending = snapshotSource(pendingInput);
      const pendingCommit = jsonData(own(pendingInput, 'commit'));
      const predecessor = fields(jsonData(own(input, 'predecessor')), ['pr', 'head', 'tree', 'merge']);
      if (!Number.isSafeInteger(predecessor.pr) || predecessor.pr <= 0 ||
          ![predecessor.head, predecessor.tree, predecessor.merge].every(control.validSha) ||
          predecessor.head === pending.sourceSha || predecessor.merge === pending.sourceSha ||
          !Array.isArray(pendingCommit.parents) || ![1, 2].includes(pendingCommit.parents.length) ||
          pendingCommit.parents[0]?.sha !== original.sourceSha ||
          (pendingCommit.parents.length === 2 && !control.validSha(pendingCommit.parents[1]?.sha)) ||
          pending.sourceTree !== original.tree) return unavailable();
      return Object.freeze({ valid: true, scope: 'prepared-inputs-only', profileId: profile.id, binding,
        sourceSha: original.sourceSha, sourceTree: original.sourceTree,
        fromVersion: original.prepared.fromVersion, preparationDate: original.date,
        pendingSha: pending.sourceSha, pendingTree: pending.sourceTree, predecessor,
        pendingParent: pendingCommit.parents.length === 2 ? pendingCommit.parents[1].sha : null,
        queue: original.queue, artifactDigest: native.artifactDigest });
    } catch { return unavailable(); }
  };
}
