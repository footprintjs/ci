import { createHash } from 'node:crypto';
import { flowChart, FlowChartExecutor, decide } from 'footprintjs';
import { controlDepRecorder } from 'footprintjs/trace';
import { captureRecord } from '../record.mjs';
import { createRefreshInputReader } from './refresh-inputs.mjs';

/** Native prepared-input subflow, with no network or effect port. Rich prepared
 * data stays in backend memory; scope holds finite facts and its digest reference.
 * Success proves prepared inputs only. Native lineage, ancestry, eligibility and
 * each actual effect's fresh admission still belong to the surrounding Propose flow.
 */
export async function runProposePreparation({ profile, inputs, recordLimitBytes } = {}) {
  let backend = null;
  const chart = flowChart('Reconstruct prepared inputs', scope => {
    let candidate;
    try { candidate = createRefreshInputReader(profile)(inputs); } catch { candidate = null; }
    backend = candidate?.valid === true ? candidate : null;
    if (!backend) {
      scope.proposePreparationRefs = [];
      scope.proposeInputFacts = { present: false, readOnly: true }; return;
    }
    // Only owned deterministic data from the pure reader is hashed. Values,
    // provider bodies, notes, scope contents and exception text are never retained.
    const digest = createHash('sha256').update(JSON.stringify(backend)).digest('hex');
    scope.proposePreparationRefs = backend.preparationRefs;
    scope.proposeInputFacts = { present: true, readOnly: true, identical: backend.samePreparation,
      baseSha: backend.sourceSha, headSha: backend.pendingSha, treeSha: backend.targetTree,
      version: backend.version, receiptRef: digest };
  }, 'propose-inputs').addDeciderFunction('Prepared input decision', scope => decide(scope, [
    { when: s => s.proposeInputFacts.present === true, then: 'inputs-prepared', label: 'Prepared inputs only; authority still separate' },
  ], 'inputs-held'), 'propose-inputs-decision')
    .addFunctionBranch('inputs-prepared', 'Prepared input closure known', scope => {
      scope.proposeOutcome = 'pass'; scope.proposeReason = 'PROPOSAL_INPUTS_READY';
    })
    .addFunctionBranch('inputs-held', 'Prepared input closure unavailable', scope => {
      scope.proposeOutcome = 'hold'; scope.proposeReason = 'PROPOSAL_INPUTS_UNAVAILABLE';
    }).setDefault('inputs-held').end()
    .addFunction('Record prepared-input result', scope => {
      const facts = scope.proposeInputFacts;
      const refs = scope.proposePreparationRefs;
      scope.proposeResult = { outcome: scope.proposeOutcome, reason: scope.proposeReason,
        facts: { ...facts, count: refs.length, approved: false, executedWrites: 0 } };
      if (facts.receiptRef) scope.proposeDigest = facts.receiptRef;
    }, 'propose-report').build();
  const executor = new FlowChartExecutor(chart, { initialContext: { readOnly: true },
    commitValues: 'delta', captureCoverage: true, readSources: true, writeProvenance: 'reads-prefix' });
  executor.attachFlowRecorder(controlDepRecorder({ id: 'control', captureCoverage: true }));
  let completed = false;
  try { await executor.run(); completed = true; } catch { backend = null; }
  const snapshot = completed ? executor.getSnapshot() : undefined;
  const record = captureRecord({ snapshot, structure: chart.buildTimeStructure, completed, recordLimitBytes,
    reason: 'NATIVE_FAILURE' });
  const result = snapshot?.sharedState?.proposeResult;
  const report = { authorized: false, executedWrites: 0, identical: result?.facts?.identical === true,
    preparedInputsAvailable: result?.facts?.present === true,
    ...(result?.facts?.receiptRef ? { receiptRef: result.facts.receiptRef } : {}) };
  return { status: !record.complete ? 'incomplete' : result?.outcome === 'pass' ? 'prepared-inputs-only' : 'held',
    report, record, backend: record.complete && result?.outcome === 'pass' ? backend : null };
}
