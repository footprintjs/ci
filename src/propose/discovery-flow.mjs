import { flowChart, FlowChartExecutor, decide } from 'footprintjs';
import { controlDepRecorder } from 'footprintjs/trace';
import { captureRecord } from '../record.mjs';
import { createPendingWitnessDiscovery } from './pending-discovery.mjs';

/** Native read-only discovery subflow. Only owned references/finite reasons enter
 * scope; provider bodies, Git file bytes and archives remain backend-local. Full
 * Propose admission must separately join published lineage, fresh collection,
 * source ancestry, reviews, ordinary kind, App/current producer and writer grants.
 */
export async function runPendingWitnessDiscovery({ profile, nativeProfile, repository, readSource, readCandidateEvidence, inputs, recordLimitBytes } = {}) {
  let discovered = null;
  const chart = flowChart('Discover retained pending preparation witnesses', async scope => {
    let result;
    try {
      result = await createPendingWitnessDiscovery({ profile, nativeProfile, repository, readSource, readCandidateEvidence })(inputs);
    } catch { result = null; }
    discovered = result?.valid === true ? result : null;
    scope.proposeDiscoveryRefs = discovered?.references ?? [];
    scope.proposeDiscoveryFacts = { present: discovered !== null, readOnly: true,
      reason: discovered ? 'pending-witnesses-bound' : result?.reason ?? 'pending-discovery-unavailable',
      count: discovered?.references.length ?? 0, authorized: false, executedWrites: 0,
      ...(discovered ? { receiptRef: discovered.digest, workflowRef: discovered.workflowDigest } : {}) };
  }, 'pending-witness-discovery')
    .addDeciderFunction('Exactly one native preparation cohort per pending hop', scope => decide(scope, [
      { when: s => s.proposeDiscoveryFacts.present === true, then: 'discovery-known', label: 'Unique reconstructed witnesses only; no authority' },
    ], 'discovery-held'), 'propose-discovery-decision')
    .addFunctionBranch('discovery-known', 'Witness discovery known', scope => { scope.proposeDiscoveryOutcome = 'known'; })
    .addFunctionBranch('discovery-held', 'Witness discovery held', scope => { scope.proposeDiscoveryOutcome = 'held'; })
    .setDefault('discovery-held').end()
    .addFunction('Save compact discovery result', scope => {
      scope.proposeDiscoveryResult = { ...scope.proposeDiscoveryFacts, outcome: scope.proposeDiscoveryOutcome };
    }, 'propose-discovery-report').build();
  const executor = new FlowChartExecutor(chart, { initialContext: { readOnly: true }, commitValues: 'delta',
    captureCoverage: true, readSources: true, writeProvenance: 'reads-prefix' });
  executor.attachFlowRecorder(controlDepRecorder({ id: 'control', captureCoverage: true }));
  let completed = false;
  try { await executor.run(); completed = true; } catch { discovered = null; }
  const snapshot = completed ? executor.getSnapshot() : undefined;
  const record = captureRecord({ snapshot, structure: chart.buildTimeStructure, completed, recordLimitBytes, reason: 'NATIVE_FAILURE' });
  const result = snapshot?.sharedState?.proposeDiscoveryResult;
  const available = result?.outcome === 'known' && discovered !== null;
  return { status: !record.complete ? 'incomplete' : available ? 'pending-witnesses-only' : 'held', record,
    report: { authorized: false, executedWrites: 0, count: result?.count ?? 0, reason: result?.reason ?? 'pending-discovery-unavailable',
      ...(available ? { receiptRef: discovered.digest } : {}) },
    backend: record.complete && available ? discovered.backend : null };
}
