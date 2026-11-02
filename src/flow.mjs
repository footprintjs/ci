import { flowChart, FlowChartExecutor, decide } from 'footprintjs';
import { controlDepRecorder } from 'footprintjs/trace';
import { captureRecord, ownData, publicFacts } from './record.mjs';
import { isKnownReason, isApprovedConfig } from './policy.mjs';

export const STAGES = Object.freeze(['plan', 'propose', 'verdict', 'authority', 'build', 'publish', 'verify']);
const OUTCOMES = new Set(['pass', 'hold', 'verify-only', 'skip', 'would-write']);
const FLOW_REASONS = new Set(['PASS', 'PORT_FAILURE', 'PORT_MISSING', 'INVALID_PORT_RESULT', 'SHADOW_WRITE_BLOCKED', 'VERIFY_ONLY_SKIP', 'FLOW_COMPLETE', 'CONFIG_UNAPPROVED', 'FLOW_CONTEXT_INVALID']);
const HELD = Symbol('release-held');
const resultKey = stage => `${stage}Result`;
const freeze = value => {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
};
const result = (outcome, reason, facts = {}) => freeze({ outcome, reason, facts });
function admitResult(raw) {
  const outcome = ownData(raw, 'outcome'); const reason = ownData(raw, 'reason');
  if (!OUTCOMES.has(outcome) || typeof reason !== 'string' || !(FLOW_REASONS.has(reason) || isKnownReason(reason))) return result('hold', 'INVALID_PORT_RESULT');
  return result(outcome, reason, publicFacts(ownData(raw, 'facts')));
}
function heldError() {
  const error = new Error('RELEASE_HELD'); error.stack = undefined;
  Object.defineProperty(error, HELD, { value: true }); return error;
}

/**
 * Fresh run only: no resume, restored scope, replayed authorization or native effect retry.
 * Ports must recollect/revalidate receipt bindings in their trusted phase. Prior records
 * are public explanation references, never execution authority. This v1 only runs shadow.
 */
export async function runReleaseFlow({ config, context = {}, ports = {}, recordLimitBytes } = {}) {
  let inputAdmission = 'pass';
  if (!isApprovedConfig(config)) inputAdmission = 'CONFIG_UNAPPROVED';
  else {
    try {
      if (ownData(context, 'mode') !== 'shadow' || ownData(context, 'phase') !== 'control') inputAdmission = 'FLOW_CONTEXT_INVALID';
    } catch { inputAdmission = 'FLOW_CONTEXT_INVALID'; }
  }
  // Rejected caller data never enters tracked state. Missing mode/phase are refused.
  let safeContext;
  try { safeContext = inputAdmission === 'pass' ? freeze(publicFacts(context)) : freeze({}); }
  catch { inputAdmission = 'FLOW_CONTEXT_INVALID'; safeContext = freeze({}); }
  let builder;
  const execute = stage => async scope => {
    const save = value => {
      scope[resultKey(stage)] = value;
      scope[`${stage}Outcome`] = value.outcome;
      scope[`${stage}Reason`] = value.reason;
      if (value.facts.digest) scope[`${stage}Digest`] = value.facts.digest;
    };
    try {
      if (stage === 'plan' && scope.inputAdmission !== 'pass') {
        save(result('hold', scope.inputAdmission)); return;
      }
      const currentContext = scope.releaseContext;
      const prior = {};
      for (const previous of STAGES.slice(0, STAGES.indexOf(stage))) {
        const observed = scope[resultKey(previous)];
        if (observed !== undefined) prior[previous] = admitResult(observed);
      }
      if (stage !== 'plan' && stage !== 'verify' && scope.verifyOnly === true) {
        save(result('skip', 'VERIFY_ONLY_SKIP'));  return;
      }
      const port = ownData(ports, stage);
      if (typeof port !== 'function') { save(result('hold', 'PORT_MISSING'));  return; }
      const readOnly = Object.getOwnPropertyDescriptor(port, 'readOnly');
      if (readOnly?.value !== true) { save(result('would-write', 'SHADOW_WRITE_BLOCKED'));  return; }
      // Raw config is backend-only; the native stage records only the bounded public
      // context and prior results actually read here. Config hooks are never executed.
      const raw = await port({ stage, config, context: freeze(publicFacts(currentContext)), prior: freeze(prior) });
      save(admitResult(raw));
    } catch {
      // Catch BEFORE the SDK observes a returned/rejected provider value or exception.
      save(result('hold', 'PORT_FAILURE'));
    }
  };
  const decision = stage => scope => decide(scope, [
    { when: s => s[`${stage}Outcome`] === 'hold' || s[`${stage}Outcome`] === 'would-write', then: `${stage}-hold`, label: 'Refuse unsafe or incomplete evidence' },
    { when: s => s[`${stage}Outcome`] === 'verify-only', then: `${stage}-verify-only`, label: 'Continue with observation only' },
  ], `${stage}-continue`);
  for (const stage of STAGES) {
    builder = builder ? builder.addFunction(stage, execute(stage), stage) : flowChart(stage, execute(stage), stage);
    builder = builder.addDeciderFunction(`${stage} decision`, decision(stage), `${stage}-decision`)
      .addFunctionBranch(`${stage}-hold`, `${stage} held`, () => { throw heldError(); })
      .addFunctionBranch(`${stage}-verify-only`, `${stage} verify only`, scope => { scope.verifyOnly = true; })
      .addFunctionBranch(`${stage}-continue`, `${stage} accepted`, () => undefined)
      .setDefault(`${stage}-hold`).end();
  }
  const chart = builder.build();
  const executor = new FlowChartExecutor(chart, { initialContext: { releaseContext: safeContext, verifyOnly: false, inputAdmission }, commitValues: 'delta', captureCoverage: true, readSources: true, writeProvenance: 'reads-prefix' });
  executor.attachFlowRecorder(controlDepRecorder({ id: 'control', captureCoverage: true }));
  let completed = false; let held = false;
  try { await executor.run(); completed = true; }
  catch (error) { if (error?.[HELD] === true) { completed = true; held = true; } }
  const snapshot = completed ? executor.getSnapshot() : undefined;
  const stages = {};
  for (const stage of STAGES) {
    const value = snapshot?.sharedState?.[resultKey(stage)];
    if (value) stages[stage] = value;
  }
  const record = captureRecord({ snapshot, structure: chart.buildTimeStructure, completed, recordLimitBytes, reason: 'NATIVE_FAILURE' });
  const status = !record.complete ? 'incomplete' : held ? 'held' : 'complete';
  const lastStage = Object.keys(stages).at(-1);
  return { status, stages, record, summary: `${status}; ${lastStage ?? 'none'}: ${lastStage ? stages[lastStage].reason : 'RUN_INCOMPLETE'}` };
}
