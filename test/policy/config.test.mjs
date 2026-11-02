import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, evaluateStage, KNOWN_REASONS, REASON_MESSAGES, isKnownReason } from '../../src/policy.mjs';
const raw = () => ({ schemaVersion: 1, profile: 'foottrace-v1', repository: { id: 123, full_name: 'footprintjs/foottrace' }, package: 'foottrace', app: { slug: 'release-app', clientId: 'public-client-id' }, workflow: '.github/workflows/publish.yml', requiredGates: ['check (22)', 'check (24)', 'tested-tree', 'Analyze (actions)', 'Analyze (javascript-typescript)'] });
test('strict approved configuration is copied and deeply frozen', () => {
 const input = raw(), c = validateConfig(input); input.repository.id = 999;
 assert.equal(c.repository.id,123); assert(Object.isFrozen(c)); assert(Object.isFrozen(c.repository)); assert(Object.isFrozen(c.requiredGates));
});
for (const [label, change] of [
 ['unknown keys', x => x.approval=false], ['approval override',x => x.approvalProfile='none'],
 ['endpoint',x => x.registry='https://evil.invalid'],['hook',x => x.buildHook='anything'],
 ['unsupported repo',x => x.repository.full_name='footprintjs/agentfootprint'],
 ['unsupported package',x => x.package='agentfootprint'],['missing mandatory gate',x => x.requiredGates.pop()],
 ['custom workflow',x => x.workflow='.github/workflows/evil.yml'],['unknown nested key',x => x.app.privateKey='secret'],
 ['unsupported profile',x => x.profile='generic-v1'],['missing app proof',x => delete x.app.clientId],
]) test(`configuration rejects ${label}`,()=>{ const input=raw(); change(input); assert.throws(()=>validateConfig(input),{message:'CONFIG_INVALID'}); });
test('configuration rejects getters, symbols, prototypes without invoking hooks',()=>{
 let calls=0; const input=raw(); Object.defineProperty(input,'profile',{get(){calls++;return 'foottrace-v1'},enumerable:true});
 assert.throws(()=>validateConfig(input)); assert.equal(calls,0);
 const symbol=raw(); symbol[Symbol('hidden')]=true; assert.throws(()=>validateConfig(symbol));
 const proto=Object.assign(Object.create({hook:true}),raw()); assert.throws(()=>validateConfig(proto));
});
test('stages refuse unapproved configuration and unknown stages using static public codes',async()=>{
 assert.throws(()=>evaluateStage('authority',{},raw()),{message:'CONFIG_UNAPPROVED'});
 const result=await evaluateStage('unknown',{},validateConfig(raw())); assert.equal(result.outcome,'hold'); assert(KNOWN_REASONS.has(result.reason)); assert.equal(typeof REASON_MESSAGES[result.reason],'string');
});
export {raw};

test('public catalog mutation cannot admit arbitrary records or diagnostics',()=>{
 KNOWN_REASONS.add('PRIVATE_TOKEN_FAKE');
 assert.equal(isKnownReason('PRIVATE_TOKEN_FAKE'),false);
 KNOWN_REASONS.delete('PRIVATE_TOKEN_FAKE');
 assert.equal(isKnownReason('authority-approval'),true);
 assert.equal(isKnownReason('github-http-not-found'),true);
 assert.equal(isKnownReason('readonly-route'),true);
});
