'use strict';
// This dependency-free validator is embedded in the reviewed reusable workflow.
// It executes before any tool checkout and accepts only canonical JSON (valid YAML).
const SHA = /^[a-f0-9]{40}$/;
const REF = 'footprintjs/foottrace/.github/workflows/publish.yml@refs/heads/main';
function isOpaqueCredential(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 8192 && !/[^\x21-\x7E]/.test(value);
}
function fail() { throw new Error('caller-binding-refused'); }
function fields(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const keys = Object.keys(value).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...expected].sort())) fail();
}
function validateCaller(bytes, toolSha) {
  if (typeof bytes !== 'string' || Buffer.byteLength(bytes) > 512 * 1024 || !SHA.test(toolSha)) fail();
  let caller;
  try { caller = JSON.parse(bytes); } catch { fail(); }
  if (JSON.stringify(caller) !== bytes.trim()) fail();
  fields(caller, ['name','on','permissions','jobs']);
  if (typeof caller.name !== 'string' || caller.name.length > 100) fail();
  fields(caller.permissions, ['contents']);
  if (caller.permissions.contents !== 'read') fail();
  fields(caller.on, ['push','workflow_dispatch']);
  fields(caller.on.push, ['branches']);
  if (JSON.stringify(caller.on.push.branches) !== '["main"]') fail();
  fields(caller.on.workflow_dispatch, []);
  fields(caller.jobs, ['release']);
  fields(caller.jobs.release, ['uses','with']);
  if (caller.jobs.release.uses !== `footprintjs/ci/.github/workflows/release.yml@${toolSha}`) fail();
  fields(caller.jobs.release.with, ['tool_sha','source_sha','mode']);
  if (caller.jobs.release.with.tool_sha !== toolSha || caller.jobs.release.with.source_sha !== '$' + '{{ github.sha }}' || caller.jobs.release.with.mode !== 'shadow') fail();
  return true;
}
async function readBounded(response) {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 1024 * 1024)) fail();
  const reader = response.body?.getReader();
  if (!reader) fail();
  let size = 0; const chunks = [];
  for (;;) {
    const next = await reader.read(); if (next.done) break;
    size += next.value.byteLength;
    if (size > 1024 * 1024) { await reader.cancel(); fail(); }
    chunks.push(Buffer.from(next.value));
  }
  return Buffer.concat(chunks);
}
async function main(env = process.env, fetcher = fetch) {
  const { TOOL_SHA, SOURCE_SHA, WORKFLOW_REF, GH_TOKEN } = env;
  if (!SHA.test(TOOL_SHA ?? '') || !SHA.test(SOURCE_SHA ?? '') || WORKFLOW_REF !== REF ||
      !isOpaqueCredential(GH_TOKEN)) fail();
  const url = `https://api.github.com/repos/footprintjs/foottrace/contents/.github/workflows/publish.yml?ref=${SOURCE_SHA}`;
  const response = await fetcher(url, { method:'GET', redirect:'error', signal:AbortSignal.timeout(30000),
    headers: { authorization:`Bearer ${GH_TOKEN}`, accept:'application/vnd.github+json', 'x-github-api-version':'2022-11-28' } });
  if (response.status !== 200) fail();
  let value;
  try { value = JSON.parse((await readBounded(response)).toString('utf8')); } catch { fail(); }
  if (value.type !== 'file' || value.path !== '.github/workflows/publish.yml' || value.encoding !== 'base64' ||
      !Number.isSafeInteger(value.size) || value.size < 1 || value.size > 512 * 1024 ||
      typeof value.content !== 'string' || !/^[A-Za-z0-9+/=\r\n]*$/.test(value.content)) fail();
  const bytes = Buffer.from(value.content,'base64');
  if (bytes.length !== value.size) fail();
  validateCaller(new TextDecoder('utf-8',{fatal:true}).decode(bytes), TOOL_SHA);
}
module.exports = { validateCaller, main };
