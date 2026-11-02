import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const { validateCaller, main } = createRequire(import.meta.url)('../../bin/caller-preflight.cjs');
const pin = 'a'.repeat(40), wrong = 'b'.repeat(40);
const caller = () => ({name:'publish',on:{push:{branches:['main']},workflow_dispatch:{}},permissions:{contents:'read'},jobs:{release:{uses:`footprintjs/ci/.github/workflows/release.yml@${pin}`,with:{tool_sha:pin,source_sha:'${{ github.sha }}',mode:'shadow'}}}});
test('caller binds exact actual release job uses, tool pin and source expression before tool checkout', () => {
  assert.equal(validateCaller(JSON.stringify(caller()),pin),true);
  for (const change of [x=>x.jobs.release.uses=`footprintjs/ci/.github/workflows/release.yml@${wrong}`,
    x=>x.jobs.release.with.tool_sha=wrong,x=>x.jobs.release.with.mode='live',x=>x.jobs.release.with.source_sha=pin,
    x=>x.jobs.other={uses:`footprintjs/ci/.github/workflows/release.yml@${pin}`},x=>x.permissions.contents='write',
    x=>x.jobs.release.secrets='inherit', x=>x.jobs.release.with.config='evil.mjs']) {
    const value=caller();change(value);assert.throws(()=>validateCaller(JSON.stringify(value),pin));
  }
  assert.throws(()=>validateCaller(JSON.stringify(caller()),wrong));
  assert.throws(()=>validateCaller('# uses correct pin '+pin+'\n'+JSON.stringify(caller()),pin));
  const duplicate=JSON.stringify(caller()).replace('"tool_sha":',`"tool_sha":"${wrong}","tool_sha":`);
  assert.throws(()=>validateCaller(duplicate,pin));
  assert.throws(()=>validateCaller(JSON.stringify(caller(),null,2),pin));
});
test('fixed bounded caller GET has no redirect, alternate route, authority mutation or unbounded response', async () => {
  const bytes=Buffer.from(JSON.stringify(caller()));let observed;
  const env={TOOL_SHA:pin,SOURCE_SHA:wrong,WORKFLOW_REF:'footprintjs/foottrace/.github/workflows/publish.yml@refs/heads/main',GH_TOKEN:'ghp_fixture'};
  const fetcher=async(url,options)=>{observed={url,options};return Response.json({type:'file',path:'.github/workflows/publish.yml',encoding:'base64',size:bytes.length,content:bytes.toString('base64')});};
  await main(env,fetcher);
  assert.equal(observed.url,`https://api.github.com/repos/footprintjs/foottrace/contents/.github/workflows/publish.yml?ref=${wrong}`);
  assert.equal(observed.options.method,'GET');assert.equal(observed.options.redirect,'error');
  await assert.rejects(main({...env,WORKFLOW_REF:'footprintjs/foottrace/.github/workflows/other.yml@refs/heads/main'},fetcher));
  await assert.rejects(main(env,async()=>new Response('private body',{status:302,headers:{location:'https://evil.invalid'}})));
  await assert.rejects(main(env,async()=>new Response('x',{headers:{'content-length':'1048577'}})));
});
test('workflow embeds exact reviewed dependency-free preflight ahead of any checkout', async () => {
  const source=await readFile('.github/workflows/release.yml','utf8'), preflight=await readFile('bin/caller-preflight.cjs','utf8');
  const embedded=preflight.trimEnd().split('\n').map(line=>'          '+line).join('\n');
  assert(source.includes(embedded));assert(source.indexOf('- name: Bind the caller pin')<source.indexOf('- name: Checkout reviewed tool'));
});
