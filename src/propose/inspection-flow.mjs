import { createHash } from 'node:crypto';
import { flowChart, FlowChartExecutor, decide } from 'footprintjs';
import { controlDepRecorder } from 'footprintjs/trace';
import { captureRecord } from '../record.mjs';
import native from '../guards/release-github.cjs';
import { packageProfile } from './package-profile.mjs';
import { createRetainedAttemptAssessor } from './retained-attempts.mjs';
import { createRefreshInputReader } from './refresh-inputs.mjs';
import { own, keys } from './source-inventory.mjs';
const digest = data => createHash('sha256').update(JSON.stringify(data)).digest('hex');
import { lineageBinding, ancestryBinding, reviewBinding, workflowBinding, candidateBinding, sourceVersionBinding, retainedWitnessBinding, proposerBinding, currentPreparationBinding, ordinaryPreparationBinding } from './inspection-bindings.mjs';

/** Trusted host-code readers compose the read-only knowledge stages. This is not
 * retained eligibility, fresh current-run/App approval or permission to mutate.
 * Reader bodies/errors stay outside scope; only owned bindings/digest refs enter.
 */
export async function runProposeInspection({ profile, inputs, readers, recordLimitBytes, retainedProfile, inputBootstrap } = {}) {
  const assessRetainedAttempts = createRetainedAttemptAssessor(retainedProfile);
  let retainedAttempts = null;
  let prepared = null, ordinaryPreparation = null, lineage = null, ancestry = null, reviews = null, workflows = null, candidate = null, sourceVersions = null, retainedWitnesses = null, currentProposer = null, currentPreparation = null, workflowCollection = null, recipe = null, ports = null;
  try {
    keys(readers, ['readLineage', 'readAncestry', 'readReviews', 'readWorkflows', 'readRetainedWitnesses', 'readRetainedVersions', 'readCandidatePublication', 'readCurrentProposer', 'readCurrentPreparation', 'readOrdinaryPreparation']);
    const readLineage = own(readers, 'readLineage'), readAncestry = own(readers, 'readAncestry'), readReviews = own(readers, 'readReviews'), readWorkflows = own(readers, 'readWorkflows'), readRetainedWitnesses = own(readers, 'readRetainedWitnesses'), readRetainedVersions = own(readers, 'readRetainedVersions'), readCandidatePublication = own(readers, 'readCandidatePublication'), readCurrentProposer = own(readers, 'readCurrentProposer'), readCurrentPreparation = own(readers, 'readCurrentPreparation'), readOrdinaryPreparation = own(readers, 'readOrdinaryPreparation');
    if ([readLineage, readAncestry, readReviews, readWorkflows, readRetainedWitnesses, readRetainedVersions, readCandidatePublication, readCurrentProposer, readCurrentPreparation, readOrdinaryPreparation].every(port => typeof port === 'function')) ports = { readLineage, readAncestry, readReviews, readWorkflows, readRetainedWitnesses, readRetainedVersions, readCandidatePublication, readCurrentProposer, readCurrentPreparation, readOrdinaryPreparation };
  } catch { /* An unavailable trusted port takes the native hold branch. */ }
  const prepareInputStage = scope => {
    try { recipe = packageProfile(profile); const actualInputs = inputBootstrap ? (scope.proposeBootstrapResult.available === true ? inputBootstrap.getBackend()?.inputs : null) : inputs; const value = createRefreshInputReader(recipe)(actualInputs); if (value.valid === true) prepared = value; } catch { prepared = null; }
    scope.proposePreparationRefs = prepared?.preparationRefs ?? [];
    scope.proposeEvidenceRefs = [];
    scope.proposeInspectionFacts = { retainedAttemptsAssessed: false, retainedAttemptsEligible: false, retainedAttemptsReason: 'not-inspected', ordinaryPreparation: false, ordinaryReason: 'not-inspected', ordinaryNativeReason: 'not-inspected', present: prepared !== null && ports !== null, lineage: false, ancestry: false, reviews: false, reviewReason: 'not-inspected', workflows: false, workflowReason: 'not-inspected',
      currentPreparation: false, currentPreparationReason: 'not-inspected', currentPreparationNativeReason: 'not-inspected', proposerIdentity: false, proposerReason: 'not-inspected', proposerNativeReason: 'not-inspected', writerCredentialBindingAdmitted: false, witnessesBound: false, witnessReason: 'not-inspected', candidatePublication: false, candidateReason: 'not-inspected', sourceVersions: false, sourceVersionReason: 'not-inspected', sourceVersionNonterminal: 0,
      workflowRuns: 0, workflowAttempts: 0, workflowArtifacts: 0, workflowNonterminal: 0, workflowEffectStages: 0,
      readOnly: true, eligibilityAdmitted: false, authorized: false };
  };
  const start = inputBootstrap ? inputBootstrap.chart.addFunction('Reconstruct source preparation', prepareInputStage, 'propose-inspection-inputs') : flowChart('Reconstruct source preparation', prepareInputStage, 'propose-inspection-inputs');
  const chart = start.addDeciderFunction('Prepared inputs available', scope => decide(scope, [
    { when: s => s.proposeInspectionFacts.present === true, then: 'read-ordinary', label: 'Reconstructed inputs and trusted readers' },
  ], 'hold-ordinary'), 'propose-inspection-prepared-decision')
    .addFunctionBranch('read-ordinary', 'Inspect actual native ordinary sources and preparations', async scope => {
      try {
        const raw = await ports.readOrdinaryPreparation(prepared);
        scope.proposeInspectionFacts = { ...scope.proposeInspectionFacts,
          ordinaryReason: own(raw, 'reason') === 'ordinary-active-recovery' ? 'ordinary-active-recovery' : 'ordinary-preparation-unavailable',
          ordinaryNativeReason: own(raw, 'valid') === true ? 'binding-unavailable' : native.refusalCode({ code: own(raw, 'nativeReason') }) };
        ordinaryPreparation = ordinaryPreparationBinding(raw, prepared);
        scope.proposeEvidenceRefs = [...scope.proposeEvidenceRefs, { kind: 'native-ordinary-preparation', receiptRef: digest(ordinaryPreparation),
          headSha: prepared.sourceSha, count: ordinaryPreparation.references.length }];
        scope.proposeInspectionFacts = { ...scope.proposeInspectionFacts, ordinaryPreparation: true,
          ordinaryReason: 'native-ordinary-preparation-bound', ordinaryNativeReason: 'native-ordinary-preparation-bound' };
      } catch {
        ordinaryPreparation = null;
        if (scope.proposeInspectionFacts.ordinaryReason === 'not-inspected')
          scope.proposeInspectionFacts = { ...scope.proposeInspectionFacts, ordinaryReason: 'ordinary-preparation-unavailable', ordinaryNativeReason: 'unavailable' };
      }
    })
    .addFunctionBranch('hold-ordinary', 'Native ordinary preparation blocked', () => {}).setDefault('hold-ordinary').end()
    .addDeciderFunction('Native ordinary sources joined', scope => decide(scope, [
      { when: s => s.proposeInspectionFacts.ordinaryPreparation === true, then: 'read-lineage', label: 'Actual ordinary source and queue reconstructions bound; inspect published predecessor' },
    ], 'hold-lineage'), 'propose-inspection-ordinary-decision')
    .addFunctionBranch('read-lineage', 'Inspect exact published predecessor', async scope => {
      try {
        const raw = await ports.readLineage({ sourceSha: prepared.sourceSha, sourceTree: prepared.sourceTree,
          fromVersion: prepared.fromVersion, predecessor: prepared.predecessor });
        lineage = lineageBinding(raw, prepared);
        scope.proposeEvidenceRefs = [...scope.proposeEvidenceRefs, { kind: 'published-lineage', receiptRef: digest(lineage),
          headSha: lineage.predecessor.head, treeSha: lineage.tree, archiveDigest: lineage.archiveDigest, count: lineage.count }];
        scope.proposeInspectionFacts = { ...scope.proposeInspectionFacts, lineage: true };
      } catch { lineage = null; }
    })
    .addFunctionBranch('hold-lineage', 'Published predecessor inspection blocked', () => {}).setDefault('hold-lineage').end()
    .addDeciderFunction('Published lineage joined', scope => decide(scope, [
      { when: s => s.proposeInspectionFacts.lineage === true, then: 'read-ancestry', label: 'Exact predecessor binding' },
    ], 'hold-ancestry'), 'propose-inspection-lineage-decision')
    .addFunctionBranch('read-ancestry', 'Inspect complete source ancestry', async scope => {
      try {
        ancestry = ancestryBinding(await ports.readAncestry(prepared), prepared);
        scope.proposeEvidenceRefs = [...scope.proposeEvidenceRefs, { kind: 'source-ancestry', receiptRef: digest(ancestry),
          baseSha: ancestry.edges[0].from, headSha: ancestry.sourceSha, count: ancestry.count }];
        scope.proposeInspectionFacts = { ...scope.proposeInspectionFacts, ancestry: true };
      } catch { ancestry = null; }
    })
    .addFunctionBranch('hold-ancestry', 'Source ancestry inspection blocked', () => {}).setDefault('hold-ancestry').end()
    .addDeciderFunction('Source ancestry joined', scope => decide(scope, [
      { when: s => s.proposeInspectionFacts.ancestry === true, then: 'read-reviews', label: 'Source relationships known; inspect pending reviews next' },
    ], 'hold-reviews'), 'propose-inspection-review-entry-decision')
    .addFunctionBranch('read-reviews', 'Inspect adjacent native reviews and permissions', async scope => {
      try {
        const raw = await ports.readReviews(prepared);
        const reasons = ['effective-approval', 'effective-refusal', 'pending-review', 'review-evidence-unavailable'];
        const code = own(raw, 'valid') === true ? 'review-binding-unavailable' : own(raw, 'reason');
        scope.proposeInspectionFacts = { ...scope.proposeInspectionFacts,
          reviewReason: reasons.includes(code) || code === 'review-binding-unavailable' ? code : 'review-evidence-unavailable' };
        reviews = reviewBinding(raw, prepared, recipe);
        scope.proposeEvidenceRefs = [...scope.proposeEvidenceRefs, { kind: 'native-reviews', receiptRef: digest(reviews),
          headSha: prepared.pendingSha, count: reviews.reviewCount }];
        scope.proposeInspectionFacts = { ...scope.proposeInspectionFacts, reviews: true, reviewReason: 'review-evidence-bound' };
      } catch {
        reviews = null;
        if (scope.proposeInspectionFacts.reviewReason === 'not-inspected')
          scope.proposeInspectionFacts = { ...scope.proposeInspectionFacts, reviewReason: 'review-evidence-unavailable' };
      }
    })
    .addFunctionBranch('hold-reviews', 'Pending review evidence blocked', () => {}).setDefault('hold-reviews').end()
    .addDeciderFunction('Pending review evidence joined', scope => decide(scope, [
      { when: s => s.proposeInspectionFacts.reviews === true, then: 'read-workflows', label: 'Inspect retained workflow observations; source versions and full eligibility remain separate' },
    ], 'hold-workflows'), 'propose-inspection-workflow-entry-decision')
    .addFunctionBranch('read-workflows', 'Inspect retained runs, attempts, jobs and artifacts', async scope => {
      try {
        workflowCollection = await ports.readWorkflows(prepared);
        if (own(workflowCollection, 'reason') === 'retained-workflow-discovery-drift') scope.proposeInspectionFacts = { ...scope.proposeInspectionFacts, workflowReason: 'retained-workflow-discovery-drift' };
        workflows = workflowBinding(workflowCollection, prepared);
        scope.proposeEvidenceRefs = [...scope.proposeEvidenceRefs, { kind: 'retained-workflows', receiptRef: digest(workflows),
          headSha: prepared.pendingSha, count: workflows.count }];
        scope.proposeInspectionFacts = { ...scope.proposeInspectionFacts, workflows: true, workflowReason: 'retained-observations-bound',
          workflowRuns: workflows.runs, workflowAttempts: workflows.attempts, workflowArtifacts: workflows.artifacts,
          workflowNonterminal: workflows.nonterminal, workflowEffectStages: workflows.effectStages };
      } catch {
        workflows = null; scope.proposeInspectionFacts = { ...scope.proposeInspectionFacts, workflowReason: scope.proposeInspectionFacts.workflowReason === 'retained-workflow-discovery-drift' ? 'retained-workflow-discovery-drift' : 'retained-workflow-unavailable' };
      }
    })
    .addFunctionBranch('hold-workflows', 'Retained workflow observations blocked', () => {}).setDefault('hold-workflows').end()
    .addDeciderFunction('Retained workflow observations joined', scope => decide(scope, [
      { when: s => s.proposeInspectionFacts.workflows === true, then: 'read-retained-witnesses', label: 'Join each preparation producer and exact downloaded archive to native observations' },
    ], 'hold-retained-witnesses'), 'propose-inspection-retained-witness-entry-decision')
    .addFunctionBranch('read-retained-witnesses', 'Inspect actual retained preparation witnesses', async scope => {
      try {
        retainedWitnesses = retainedWitnessBinding(await ports.readRetainedWitnesses(prepared, workflowCollection), prepared, workflows);
        scope.proposeEvidenceRefs = [...scope.proposeEvidenceRefs, { kind: 'retained-preparation-witnesses', receiptRef: digest(retainedWitnesses),
          headSha: prepared.pendingSha, count: retainedWitnesses.count }];
        scope.proposeInspectionFacts = { ...scope.proposeInspectionFacts, witnessesBound: true, witnessReason: 'retained-preparation-witnesses-bound' };
      } catch {
        retainedWitnesses = null;
        scope.proposeInspectionFacts = { ...scope.proposeInspectionFacts, witnessReason: 'retained-preparation-witness-unavailable' };
      }
    })
    .addFunctionBranch('hold-retained-witnesses', 'Retained preparation witnesses blocked', () => {}).setDefault('hold-retained-witnesses').end()
    .addDeciderFunction('Retained preparation witnesses joined', scope => decide(scope, [
      { when: s => s.proposeInspectionFacts.witnessesBound === true, then: 'read-source-versions', label: 'Bind every retained source to immutable package bytes and version' },
    ], 'hold-source-versions'), 'propose-inspection-source-version-entry-decision')
    .addFunctionBranch('read-source-versions', 'Inspect retained source versions and candidate effects', async scope => {
      try {
        const raw = await ports.readRetainedVersions(prepared, workflowCollection);
        scope.proposeInspectionFacts = { ...scope.proposeInspectionFacts, sourceVersionReason:
          own(raw, 'reason') === 'candidate-effect-or-submission-uncertain' ? 'candidate-effect-or-submission-uncertain' : 'retained-source-version-unavailable' };
        sourceVersions = sourceVersionBinding(raw, prepared, workflows, workflowCollection, recipe);
        scope.proposeEvidenceRefs = [...scope.proposeEvidenceRefs, { kind: 'retained-source-versions', receiptRef: digest(sourceVersions),
          headSha: prepared.pendingSha, count: sourceVersions.count }];
        scope.proposeInspectionFacts = { ...scope.proposeInspectionFacts, sourceVersions: true,
          sourceVersionReason: 'retained-source-versions-bound', sourceVersionNonterminal: sourceVersions.nonterminalCount };
      } catch {
        sourceVersions = null;
        if (scope.proposeInspectionFacts.sourceVersionReason === 'not-inspected')
          scope.proposeInspectionFacts = { ...scope.proposeInspectionFacts, sourceVersionReason: 'retained-source-version-unavailable' };
      }
    })
    .addFunctionBranch('hold-source-versions', 'Retained source versions blocked', () => {}).setDefault('hold-source-versions').end()
    .addDeciderFunction('Retained source versions joined', scope => decide(scope, [
      { when: s => s.proposeInspectionFacts.sourceVersions === true, then: 'read-candidate', label: 'Inspect native reservations/publication for every admitted pending and target version' },
    ], 'hold-candidate'), 'propose-inspection-candidate-entry-decision')
    .addFunctionBranch('read-candidate', 'Inspect candidate native publication conflicts', async scope => {
      try {
        const raw = await ports.readCandidatePublication(prepared);
        const reason = own(raw, 'reason');
        scope.proposeInspectionFacts = { ...scope.proposeInspectionFacts, candidateReason:
          reason === 'candidate-reservation-or-publication' ? reason : 'candidate-publication-unavailable' };
        candidate = candidateBinding(raw, prepared, recipe);
        scope.proposeEvidenceRefs = [...scope.proposeEvidenceRefs, { kind: 'candidate-publication', receiptRef: digest(candidate),
          headSha: prepared.pendingSha, count: candidate.count }];
        scope.proposeInspectionFacts = { ...scope.proposeInspectionFacts, candidatePublication: true, candidateReason: 'candidate-observations-bound' };
      } catch {
        candidate = null;
        if (scope.proposeInspectionFacts.candidateReason === 'not-inspected')
          scope.proposeInspectionFacts = { ...scope.proposeInspectionFacts, candidateReason: 'candidate-publication-unavailable' };
      }
    })
    .addFunctionBranch('hold-candidate', 'Candidate publication evidence blocked', () => {}).setDefault('hold-candidate').end()
    .addDeciderFunction('Candidate publication observations joined', scope => decide(scope, [
      { when: s => s.proposeInspectionFacts.candidatePublication === true, then: 'read-current-proposer', label: 'Join cached App facts and live current running producer; writer handoff unadmitted' },
    ], 'hold-current-proposer'), 'propose-inspection-current-proposer-entry-decision')
    .addFunctionBranch('read-current-proposer', 'Inspect cached App facts and live current running producer', async scope => {
      try {
        const raw = await ports.readCurrentProposer(prepared);
        scope.proposeInspectionFacts = { ...scope.proposeInspectionFacts, proposerReason: 'current-proposer-unavailable',
          proposerNativeReason: own(raw, 'valid') === true ? 'binding-unavailable' : native.refusalCode({ code: own(raw, 'nativeReason') }) };
        currentProposer = proposerBinding(raw, prepared, reviews);
        scope.proposeEvidenceRefs = [...scope.proposeEvidenceRefs, { kind: 'current-proposer-identity', receiptRef: digest(currentProposer),
          headSha: prepared.sourceSha, count: currentProposer.count }];
        scope.proposeInspectionFacts = { ...scope.proposeInspectionFacts, proposerIdentity: true,
          proposerReason: 'native-current-identity-bound', proposerNativeReason: 'native-current-identity-bound' };
      } catch {
        currentProposer = null;
        if (scope.proposeInspectionFacts.proposerReason === 'not-inspected')
          scope.proposeInspectionFacts = { ...scope.proposeInspectionFacts, proposerReason: 'current-proposer-unavailable', proposerNativeReason: 'unavailable' };
      }
    })
    .addFunctionBranch('hold-current-proposer', 'Native current proposer identity blocked', () => {}).setDefault('hold-current-proposer').end()
    .addDeciderFunction('Current producer identity joined', scope => decide(scope, [
      { when: s => s.proposeInspectionFacts.proposerIdentity === true, then: 'read-current-preparation', label: 'Join the actual current prepare archive and complete reconstructed proposal' },
    ], 'hold-current-preparation'), 'propose-inspection-current-preparation-entry-decision')
    .addFunctionBranch('read-current-preparation', 'Inspect current native preparation archive', async scope => {
      try {
        const raw = await ports.readCurrentPreparation(prepared, currentProposer);
        scope.proposeInspectionFacts = { ...scope.proposeInspectionFacts, currentPreparationReason: 'current-preparation-unavailable',
          currentPreparationNativeReason: own(raw, 'valid') === true ? 'binding-unavailable' : native.refusalCode({ code: own(raw, 'nativeReason') }) };
        currentPreparation = currentPreparationBinding(raw, prepared, currentProposer);
        scope.proposeEvidenceRefs = [...scope.proposeEvidenceRefs, { kind: 'current-preparation-archive', receiptRef: digest(currentPreparation),
          headSha: prepared.sourceSha, count: currentPreparation.count }];
        scope.proposeInspectionFacts = { ...scope.proposeInspectionFacts, currentPreparation: true,
          currentPreparationReason: 'current-preparation-archive-bound', currentPreparationNativeReason: 'current-preparation-archive-bound' };
      } catch {
        currentPreparation = null;
        if (scope.proposeInspectionFacts.currentPreparationReason === 'not-inspected')
          scope.proposeInspectionFacts = { ...scope.proposeInspectionFacts, currentPreparationReason: 'current-preparation-unavailable', currentPreparationNativeReason: 'unavailable' };
      }
    })
    .addFunctionBranch('hold-current-preparation', 'Current preparation archive blocked', () => {}).setDefault('hold-current-preparation').end()
    .addDeciderFunction('Current archive available for retained classification', scope => decide(scope, [
      { when: s => s.proposeInspectionFacts.currentPreparation === true, then: 'assess-retained-attempts', label: 'Classify retained native observations with the independently bound current invocation' },
    ], 'skip-retained-attempts'), 'propose-inspection-retained-attempt-entry')
    .addFunctionBranch('assess-retained-attempts', 'Classify retained attempts and current native invocation', scope => {
      retainedAttempts = assessRetainedAttempts({ prepared, collection: workflowCollection, versions: sourceVersions, current: currentProposer, archive: currentPreparation, published: {predecessor:lineage.predecessor,version:lineage.version,tree:lineage.tree,archiveDigest:lineage.archiveDigest,producer:lineage.producer} });
      const reason = own(retainedAttempts, 'reason'), allowed = ['retained-native-nonterminal', 'retained-native-effect-or-submission', 'current-native-stage-conflict', 'retained-native-history-incomplete', 'retained-native-proposal-uncertain'];
      scope.proposeInspectionFacts = { ...scope.proposeInspectionFacts, retainedAttemptsAssessed: true,
        retainedAttemptsEligible: own(retainedAttempts, 'valid') === true && own(retainedAttempts, 'eligible') === true,
        retainedAttemptsReason: allowed.includes(reason) ? reason : 'retained-attempts-unavailable' };
    })
    .addFunctionBranch('skip-retained-attempts', 'Retained attempt classification unavailable', () => {}).setDefault('skip-retained-attempts').end()
    .addDeciderFunction('Retained attempt classification result', scope => decide(scope, [
      { when: s => s.proposeInspectionFacts.retainedAttemptsEligible === true, then: 'retained-attempts-eligible', label: 'Finite retained attempts classified; full eligibility and writer authority remain separate' },
    ], 'retained-attempts-held'), 'propose-inspection-retained-attempt-result')
    .addFunctionBranch('retained-attempts-eligible', 'Retained attempt snapshot eligible', scope => {
      scope.proposeEvidenceRefs = [...scope.proposeEvidenceRefs, { kind: 'retained-native-attempts', receiptRef: retainedAttempts.digest,
        headSha: prepared.sourceSha, count: retainedAttempts.retainedAttempts }];
      scope.proposeInspectionFacts = { ...scope.proposeInspectionFacts, retainedAttemptsReason: 'retained-native-attempts-bound' };
    })
    .addFunctionBranch('retained-attempts-held', 'Retained attempt snapshot held; input inspection remains read-only', () => {}).setDefault('retained-attempts-held').end()
    .addDeciderFunction('Read-only evidence joined', scope => decide(scope, [
      { when: s => s.proposeInspectionFacts.present && s.proposeInspectionFacts.ordinaryPreparation && s.proposeInspectionFacts.lineage && s.proposeInspectionFacts.ancestry && s.proposeInspectionFacts.reviews && s.proposeInspectionFacts.workflows && s.proposeInspectionFacts.candidatePublication && s.proposeInspectionFacts.sourceVersions && s.proposeInspectionFacts.witnessesBound && s.proposeInspectionFacts.proposerIdentity && s.proposeInspectionFacts.currentPreparation,
        then: 'inspection-known', label: 'Preparation, predecessor, edges, reviews, workflow and candidate conflict observations known; full eligibility still separate' },
    ], 'inspection-held'), 'propose-inspection-final-decision')
    .addFunctionBranch('inspection-known', 'Read-only source evidence known', scope => {
      scope.proposeOutcome = 'pass'; scope.proposeReason = 'PROPOSAL_EVIDENCE_READY';
    })
    .addFunctionBranch('inspection-held', 'Read-only source evidence unavailable', scope => {
      scope.proposeOutcome = 'hold'; scope.proposeReason = 'PROPOSAL_EVIDENCE_UNAVAILABLE';
    }).setDefault('inspection-held').end()
    .addFunction('Record inspection result', scope => {
      scope.proposeResult = { outcome: scope.proposeOutcome, reason: scope.proposeReason,
        facts: { ...scope.proposeInspectionFacts, count: scope.proposeEvidenceRefs.length, approved: false, executedWrites: 0 } };
    }, 'propose-inspection-report').build();
  const executor = new FlowChartExecutor(chart, { initialContext: { readOnly: true }, commitValues: 'delta',
    captureCoverage: true, readSources: true, writeProvenance: 'reads-prefix' });
  executor.attachFlowRecorder(controlDepRecorder({ id: 'control', captureCoverage: true }));
  let completed = false;
  try { await executor.run(); completed = true; } catch { prepared = ordinaryPreparation = lineage = ancestry = reviews = workflows = candidate = sourceVersions = retainedWitnesses = currentProposer = currentPreparation = workflowCollection = null; }
  const snapshot = completed ? executor.getSnapshot() : undefined;
  const record = captureRecord({ snapshot, structure: chart.buildTimeStructure, completed, recordLimitBytes, reason: 'NATIVE_FAILURE' });
  const passed = snapshot?.sharedState?.proposeOutcome === 'pass';
  return { status: !record.complete ? 'incomplete' : passed ? 'inspection-only' : 'held',
    report: { authorized: false, executedWrites: 0, eligibilityAdmitted: false, retainedAttemptsEligible: record.complete && passed && retainedAttempts?.eligible === true }, record,
    backend: record.complete && passed ? Object.freeze({ prepared, ordinaryPreparation, lineage, ancestry, reviews, workflows, retainedWitnesses, sourceVersions, candidate, currentProposer, currentPreparation, retainedAttempts }) : null };
}
