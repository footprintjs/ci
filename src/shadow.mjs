import helper from './guards/release-github.cjs';
import { evaluateStage } from './policy.mjs';
import { createReadOnlyTransport } from './github-readonly.mjs';

export const GUARD_SOURCE_SHA = 'f55250adcbe9bbfdde75b6bc2c889bac791ca131';
const SHA = /^[a-f0-9]{40}$/;
const publicPlan = (value) => ({ version: value.version, headSha: value.sha, treeSha: value.tree, planMode: value.mode, readOnly: true, executedWrites: 0 });
function refuse(code) { const error = new Error(code); error.code = code; throw error; }
function safeFailure(error) {
  const known = helper.refusalCode(error);
  if (known !== 'release-unexpected') return known;
  const code = Object.getOwnPropertyDescriptor(error ?? {}, 'code')?.value;
  return typeof code === 'string' && /^readonly-[a-z-]+$/.test(code) ? code : 'shadow-observation-failed';
}
export async function createFoottraceShadow({ config, sourceSha, transport = createReadOnlyTransport(), guard = helper, invocation = { kind: 'local' }, verifyOnly = false } = {}) {
  if (typeof verifyOnly !== 'boolean') refuse('shadow-verification-request');
  if (!config || config.package !== 'foottrace' || config.repository?.full_name !== 'footprintjs/foottrace') refuse('shadow-profile');
  if (!invocation || !['local','github-actions'].includes(invocation.kind)) refuse('shadow-invocation');
  if (invocation.kind === 'local' && Object.keys(invocation).some((key) => key !== 'kind')) refuse('shadow-invocation');
  if (invocation.kind === 'github-actions' && (!Number.isSafeInteger(invocation.runId) || invocation.runId < 1 ||
      !Number.isSafeInteger(invocation.runAttempt) || invocation.runAttempt < 1 ||
      !['push','workflow_dispatch'].includes(invocation.eventName) || invocation.ref !== 'refs/heads/main' || !SHA.test(sourceSha ?? ''))) refuse('shadow-invocation');
  const runIdentity = invocation.kind === 'github-actions' ? { runId: invocation.runId, runAttempt: invocation.runAttempt, eventName: invocation.eventName } : {};
  let main, context, plan;
  const readonly = (callback) => Object.assign(callback, { readOnly: true });
  const observe = (callback) => readonly(async (invocation) => {
    try { return await callback(invocation); }
    catch (error) { return { outcome: 'hold', reason: 'INVALID_EVIDENCE', facts: { headSha: main, complete: false, refusalCode: safeFailure(error), readOnly: true } }; }
  });
  const middle = (stage) => observe(async () => {
    if (!plan) return { outcome: 'hold', reason: 'INVALID_EVIDENCE' };
    if (plan.mode === 'verify') return { outcome: 'skip', reason: 'PLAN_SKIP', facts: publicPlan(plan) };
    return { outcome: stage === 'propose' && plan.mode === 'prepare' ? 'would-write' : 'hold',
      reason: 'SHADOW_ONLY',
      facts: { ...publicPlan(plan), executedWrites: 0 } };
  });
  const ports = {
    plan: observe(async () => {
      main = (await transport.api('GET', '/repos/footprintjs/foottrace/git/ref/heads/main')).data?.object?.sha;
      if (!SHA.test(main ?? '') || (sourceSha !== undefined && sourceSha !== main)) refuse('shadow-source-pin');
      context = { repository: config.repository, sha: main, ref: 'refs/heads/main', eventName: invocation.kind === 'github-actions' ? invocation.eventName : 'workflow_dispatch', ...runIdentity, verify: verifyOnly };
      plan = await guard.plan(transport.api, context, { fetcher: transport.fetcher, settings: config.app });
      if (!['verify', 'prepare', 'publish'].includes(plan.mode) || !SHA.test(plan.sha) || plan.sha !== main || !SHA.test(plan.tree)) refuse('shadow-plan-shape');
      const admitted = evaluateStage('plan', { plan }, config);
      return { ...admitted, facts: { ...publicPlan(plan), inputDigest: GUARD_SOURCE_SHA, complete: true } };
    }),
    propose: middle('propose'), verdict: middle('verdict'), authority: middle('authority'), build: middle('build'), publish: middle('publish'),
    verify: observe(async ({ prior } = {}) => {
      const receipt = prior?.plan;
      if (!plan || plan.mode !== 'verify' || receipt?.outcome !== 'verify-only' || receipt.reason !== 'PLAN_VERIFY_ONLY' ||
          receipt.facts?.headSha !== main || receipt.facts.treeSha !== plan.tree || receipt.facts.version !== plan.version ||
          receipt.facts.planMode !== plan.mode || receipt.facts.inputDigest !== GUARD_SOURCE_SHA) return { outcome: 'hold', reason: 'SHADOW_ONLY' };
      const result = await guard.runStage('verify', { api: transport.api, context,
        env: { PLAN_JSON: JSON.stringify(plan), APP_SLUG: config.app.slug, APP_CLIENT_ID: config.app.clientId },
        fetcher: transport.fetcher, io: Object.freeze({ write() { refuse('readonly-method'); } }) });
      let verification;
      try { verification = JSON.parse(result.verification); } catch { refuse('shadow-verification-shape'); }
      const admitted = evaluateStage('verify', { verification }, config);
      return { ...admitted, facts: { ...admitted.facts, headSha: verification.sha, treeSha: verification.tree,
        sha256: verification.sha256, shasum: verification.shasum, latest: verification.latest,
        state: verification.state, provenanceCryptographicallyVerified: verification.provenanceCryptographicallyVerified === true, executedWrites: 0, verified: verification.state === 'verified', readOnly: true,
        complete: verification.state === 'verified', count: transport.totals().requests } };
    }),
  };
  return Object.freeze({ ports: Object.freeze(ports), context: Object.freeze({ mode: 'shadow', phase: 'control',
    repository: 'footprintjs/foottrace', packageName: 'foottrace', ...(sourceSha ? { headSha: sourceSha } : {}), invocation: invocation.kind, ...runIdentity, verifyOnlyRequested: verifyOnly }),
    observations: transport.observations });
}
