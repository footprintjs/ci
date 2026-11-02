#!/usr/bin/env node
import { mkdir, open, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import configData from '../configs/foottrace.json' with { type: 'json' };
import { validateConfig } from '../src/policy.mjs';
import { runReleaseFlow } from '../src/flow.mjs';
import { createFoottraceShadow } from '../src/shadow.mjs';
import { createReadOnlyTransport } from '../src/github-readonly.mjs';

const CODES = new Set(['cli-arguments', 'cli-live-disabled', 'cli-output-exists', 'cli-output-failed', 'shadow-source-pin', 'shadow-profile', 'shadow-invocation', 'shadow-verification-request']);
function refuse(code) { const error = new Error(code); error.code = code; throw error; }
export function parseArguments(args) {
  const result = { mode: 'shadow', phase: 'control', output: 'release-shadow', verifyOnly: false };
  const seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i], value = args[i + 1];
    if (!['--mode', '--phase', '--output', '--source-sha', '--verify-only'].includes(flag) || seen.has(flag) || typeof value !== 'string' || value.startsWith('--')) refuse('cli-arguments');
    seen.add(flag);
    result[flag.slice(2).replace('source-sha', 'sourceSha').replace('verify-only', 'verifyOnly')] = value;
  }
  if (typeof result.verifyOnly === 'string') {
    if (!['true','false'].includes(result.verifyOnly)) refuse('cli-arguments');
    result.verifyOnly = result.verifyOnly === 'true';
  }
  if (result.mode !== 'shadow') refuse('cli-live-disabled');
  if (result.phase !== 'control' || (result.sourceSha !== undefined && !/^[a-f0-9]{40}$/.test(result.sourceSha)) ||
      !result.output || result.output.length > 4096) refuse('cli-arguments');
  return result;
}
export function invocationFromEnvironment(env, sourceSha) {
  if (env.GITHUB_ACTIONS !== 'true') return { kind: 'local' };
  const numeric = (value) => typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value) && Number.isSafeInteger(Number(value));
  if (!numeric(env.GITHUB_RUN_ID) || !numeric(env.GITHUB_RUN_ATTEMPT) || env.GITHUB_REPOSITORY !== 'footprintjs/foottrace' ||
      env.GITHUB_REF !== 'refs/heads/main' || !['push','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME) ||
      sourceSha !== env.GITHUB_SHA || !/^[a-f0-9]{40}$/.test(sourceSha ?? '')) refuse('shadow-invocation');
  return { kind:'github-actions', runId:Number(env.GITHUB_RUN_ID), runAttempt:Number(env.GITHUB_RUN_ATTEMPT), eventName:env.GITHUB_EVENT_NAME, ref:env.GITHUB_REF };
}
async function save(output, result, observations = []) {
  const dir = resolve(output);
  await mkdir(dir, { recursive: true });
  if ((await lstat(dir)).isSymbolicLink()) refuse('cli-output-failed');
  const files = { 'record.json': JSON.stringify(result.record) + '\n', 'summary.json': JSON.stringify(result.summary) + '\n',
    'result.json': JSON.stringify({ status: result.status, stages: result.stages }) + '\n',
    'observations.json': JSON.stringify(observations) + '\n' };
  for (const [name, bytes] of Object.entries(files)) {
    if (Buffer.byteLength(bytes) > 2 * 1024 * 1024) refuse('cli-output-failed');
    let handle;
    try { handle = await open(join(dir, name), 'wx', 0o600); await handle.writeFile(bytes); }
    catch (error) { refuse(error?.code === 'EEXIST' ? 'cli-output-exists' : 'cli-output-failed'); }
    finally { await handle?.close(); }
  }
}
export async function main(args = process.argv.slice(2), dependencies = {}) {
  let options;
  try {
    options = parseArguments(args);
    const config = validateConfig(configData);
    const shadow = await (dependencies.createShadow ?? createFoottraceShadow)({ config, sourceSha: options.sourceSha, verifyOnly: options.verifyOnly, invocation: invocationFromEnvironment(process.env, options.sourceSha), transport: createReadOnlyTransport({ githubToken: process.env.GH_TOKEN || undefined }) });
    const result = await (dependencies.runFlow ?? runReleaseFlow)({ config, context: shadow.context, ports: shadow.ports, recordLimitBytes: 1024 * 1024 });
    await save(options.output, result, shadow.observations());
    process.stdout.write(JSON.stringify(result.summary) + '\n');
    return ['hold', 'held', 'incomplete', 'failed', 'error', 'refused'].includes(result.status) ? 1 : 0;
  } catch (error) {
    let code;
    try { code = Object.getOwnPropertyDescriptor(error ?? {}, 'code')?.value; } catch {}
    const reason = CODES.has(code) ? code : 'shadow-failed';
    process.stderr.write(JSON.stringify({ status: 'hold', mode: 'shadow', reason, executedWrites: 0 }) + '\n');
    return 1;
  }
}
if (process.argv[1] && /(?:^|[/\\])release\.(?:mjs|cjs)$/.test(process.argv[1])) main().then((code) => { process.exitCode = code; });
