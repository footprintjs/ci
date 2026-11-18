import { createHash } from 'node:crypto';

const gitId = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const validId = value => Number.isSafeInteger(value) && value > 0;
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

/**
 * The reader is installed by the trusted host. It supplies bytes directly from
 * the approved, isolated producer and observes runs and jobs independently.
 * Callers supply a locator only. GitHub job names and raw PR records authorize
 * no receipt. Approval entries must identify an immutable producer revision.
 */
export function createReceiptVerifier({ producers, reader, now = Date.now }) {
  const verified = new WeakSet();
  const deepFreeze = value => {
    if (value && typeof value === 'object') {
      for (const member of Object.values(value)) deepFreeze(member);
      Object.freeze(value);
    }
    return value;
  };
  async function verifyReceipt(locator) {
    const source = await reader.receipt(locator);
    if (!source || !Buffer.isBuffer(source.bytes) || source.bytes.length > 256 * 1024) return;
    const approved = producers.find(p => p.repository === source.repository
      && p.workflowId === source.workflowId && p.workflowRevision === source.workflowRevision);
    if (!approved || !gitId(approved.workflowRevision) || !validId(source.runId) || !validId(source.attempt)
      || digest(source.bytes) !== source.digest) return;
    // The producer must be its own workflow attempt with no jobs executing the candidate.
    // The reader must bind producer revision, artifact digest, and artifact to that run
    // from the host or API, not to values supplied in the receipt body.
    const producer = await reader.producerAttempt(source.repository, source.runId, source.attempt);
    if (producer?.repository !== approved.repository || producer.workflowId !== approved.workflowId
      || producer.workflowRevision !== approved.workflowRevision || producer.runId !== source.runId
      || producer.attempt !== source.attempt || producer.artifactDigest !== source.digest
      || producer.status !== 'completed' || producer.conclusion !== 'success'
      || producer.trigger !== approved.trigger) return;
    let body;
    try { body = JSON.parse(source.bytes.toString('utf8')); } catch { return; }
    if (body?.schema !== 1 || typeof body.receiptId !== 'string' || !body.receiptId
      || body.repository !== approved.testedRepository || !gitId(body.tree) || !gitId(body.workflowRevision)
      || !validId(body.workflowId) || !validId(body.runId) || !validId(body.attempt)
      || !validTime(body.expiresAt) || Date.parse(body.expiresAt) <= now()
      || !Array.isArray(body.cells) || !body.cells.length || body.cells.length > 200) return;
    const tested = await reader.testedAttempt(body.repository, body.runId, body.attempt);
    if (tested?.repository !== body.repository || tested.runId !== body.runId || tested.attempt !== body.attempt
      || tested.workflowId !== body.workflowId || tested.workflowRevision !== body.workflowRevision
      || tested.tree !== body.tree || tested.status !== 'completed' || !Array.isArray(tested.jobs)) return;

    const ids = new Set();
    const jobIds = new Set();
    for (const cell of body.cells) {
      if (typeof cell?.id !== 'string' || !cell.id || ids.has(cell.id)
        || !validId(cell.jobId) || jobIds.has(cell.jobId)) return;
      ids.add(cell.id);
      jobIds.add(cell.jobId);
      const actual = tested.jobs.find(job => job.id === cell.jobId);
      if (actual?.cell !== cell.id || actual.status !== 'completed' || actual.conclusion !== cell.outcome) return;
    }
    const receipt = deepFreeze({ ...body, receiptDigest: source.digest });
    verified.add(receipt);
    return receipt;
  }

  return { verifyReceipt, isVerifiedReceipt: value => verified.has(value) };
}
