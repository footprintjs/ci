import { isKnownReason } from './policy.mjs';
import { formatSlice, keysReadFromExecutionTree, sliceForKey } from 'foottrace';
/** Public evidence projection. Opaque provider responses never enter native scope. */
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const NUMBER_KEYS = new Set(['id', 'runId', 'runAttempt', 'artifactId', 'reviewId', 'pullNumber', 'count', 'size', 'gateCount', 'executedWrites', 'requests', 'bytes']);
const BOOL_KEYS = new Set(['complete', 'fresh', 'identical', 'matched', 'verified', 'approved', 'present', 'exists', 'disclosedDelegation', 'readOnly', 'tested', 'reserved', 'wouldWrite', 'observationComplete', 'provenanceCryptographicallyVerified', 'verifyOnlyRequested']);
const DIGEST_KEYS = new Set(['digest', 'sha256', 'headSha', 'baseSha', 'treeSha', 'testedTreeSha', 'archiveDigest', 'receiptRef', 'releaseRef', 'configDigest', 'inputDigest', 'shasum']);
const ENUMS = {
  mode: new Set(['shadow']),
  invocation: new Set(['local', 'github-actions']),
  eventName: new Set(['push', 'workflow_dispatch']),
  planMode: new Set(['verify', 'prepare', 'publish']),
  state: new Set(['verified', 'pending', 'pending-release', 'pending-registry', 'pending-latest', 'absent', 'unknown']),
  phase: new Set(['control', 'plan', 'propose', 'verdict', 'authority', 'build', 'publish', 'verify']),
  outcome: new Set(['pass', 'hold', 'verify-only', 'skip', 'would-write']),
  status: new Set(['complete', 'incomplete', 'held', 'present', 'absent', 'unknown', 'match', 'conflict']),
};
const NESTED_KEYS = new Set(['receipt', 'binding', 'archive', 'registry', 'review', 'gates', 'producer', 'inputs', 'verification']);
const PUBLIC_KEYS = Object.freeze([...new Set([...NUMBER_KEYS, ...BOOL_KEYS, ...DIGEST_KEYS, ...Object.keys(ENUMS), ...NESTED_KEYS, 'repository', 'packageName', 'version', 'latest', 'refusalCode'])]);
const ownData = (object, key) => {
  if (!object || typeof object !== 'object') return undefined;
  const d = Object.getOwnPropertyDescriptor(object, key);
  return d && Object.hasOwn(d, 'value') ? d.value : undefined;
};
export { ownData };

/** Deliberately small schema: unknown fields and rich values are omitted, never stringified. */
export function publicFacts(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 3 || Array.isArray(value)) return {};
  const result = {};
  for (const key of PUBLIC_KEYS) {
    const v = ownData(value, key);
    if (key === 'refusalCode' && isKnownReason(v)) result[key] = v;
    else if (BOOL_KEYS.has(key) && typeof v === 'boolean') result[key] = v;
    else if (NUMBER_KEYS.has(key) && Number.isSafeInteger(v) && v >= 0) result[key] = v;
    else if (DIGEST_KEYS.has(key) && typeof v === 'string' && SHA.test(v)) result[key] = v;
    else if (Object.hasOwn(ENUMS, key) && ENUMS[key].has(v)) result[key] = v;
    else if (key === 'repository' && typeof v === 'string' && /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(v)) result[key] = v;
    else if (key === 'packageName' && typeof v === 'string' && /^(?:@[a-z0-9-]{1,80}\/)?[a-z0-9][a-z0-9._-]{0,100}$/.test(v)) result[key] = v;
    else if ((key === 'version' || key === 'latest') && typeof v === 'string' && /^\d{1,8}\.\d{1,8}\.\d{1,8}(?:-[a-zA-Z0-9.-]{1,64})?$/.test(v)) result[key] = v;
    else if (NESTED_KEYS.has(key) && v && typeof v === 'object') result[key] = publicFacts(v, depth + 1);
  }
  return result;
}

export function captureRecord({ snapshot, structure, completed, recordLimitBytes = 1024 * 1024, reason }) {
  const limit = Number.isSafeInteger(recordLimitBytes) && recordLimitBytes >= 256 && recordLimitBytes <= 8 * 1024 * 1024 ? recordLimitBytes : 1024 * 1024;
  const fallback = why => ({ format: 'shared-release-native-v1', complete: false, reason: why });
  if (!completed) return fallback(reason === 'NATIVE_FAILURE' ? reason : 'RUN_INCOMPLETE');
  try {
    const record = { format: 'shared-release-native-v1', complete: true, snapshot, structure };
    const serialized = JSON.stringify(record);
    if (Buffer.byteLength(serialized, 'utf8') > limit) return fallback('RECORD_TOO_LARGE');
    // Detach the final native snapshot. No later scope mutation may change saved evidence.
    return JSON.parse(serialized);
  } catch {
    return fallback('RECORD_SERIALIZATION_FAILED');
  }
}

/** Native saved-record reader; this explains tracked state only and grants no execution. */
export function explainReleaseRecord(record, key) {
  if (!record?.complete || !record.snapshot) return 'Incomplete native release evidence.';
  if (typeof key !== 'string' || !/^(?:plan|propose|verdict|authority|build|publish|verify)(?:Result|Outcome|Reason|Digest)$/.test(key)) return 'Unsupported release evidence key.';
  try {
    const { commitLog, executionTree } = record.snapshot;
    return formatSlice(sliceForKey(commitLog, key, keysReadFromExecutionTree(executionTree)));
  } catch {
    return 'Unreadable native release evidence.';
  }
}
