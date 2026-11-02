import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parseVerdictComment } from '../../src/eco/verdict-comment.mjs';
const marker = '<!-- footprint-verdict v1 -->';
const hash = value => createHash('sha256').update(value).digest('hex');
const fields = { Reviewer: 'Claude', Verdict: 'merge', Action: 'merge-source', Head: 'a'.repeat(40), Base: 'b'.repeat(40), Tree: 'c'.repeat(40), Scope: 'Read source and tests; provider internals not inspected.' };
const comment = overrides => marker+'\n'+Object.entries({...fields,...overrides}).map(([k,v])=>k+': '+v).join('\n');
test('v1 syntax is bounded and digest-bound, never an authorization result', () => {
 const body=comment();const result=parseVerdictComment(body);
 assert.equal(result.kind,'parsed');assert.equal(result.verdict.head,fields.Head);assert.equal(result.verdict.action,'merge-source');
 assert.equal(result.bodySha256,hash(body));assert.deepEqual(result.verdict.scope,{sha256:hash(fields.Scope),bytes:Buffer.byteLength(fields.Scope)});
 assert.equal(result.authorized,undefined);assert.equal(result.valid,undefined);assert(Object.isFrozen(result.verdict));assert(Object.isFrozen(result.verdict.scope));
});
test('the exact R3 inline head/base/tree form and CRLF are accepted', () => {
 const body=marker+'\r\nReviewer: Claude\r\nVerdict: hold\r\nAction: release\r\nHead: '+fields.Head+'   Base: '+fields.Base+'   Tree: '+fields.Tree+'\r\nScope: reviewed archive only';
 const r=parseVerdictComment(body);assert.equal(r.kind,'parsed');assert.equal(r.verdict.base,fields.Base);assert.equal(r.verdict.tree,fields.Tree);assert.equal(r.bodySha256,hash(body));
});
test('full review footer participates in immutable body digest without entering public facts', () => {
 const a=comment()+'\n\nPrivate raw text /Users/person/key secret-value';const b=a+' changed';const r=parseVerdictComment(a);
 assert.equal(r.kind,'parsed');assert.equal(r.bodySha256,hash(a));assert.notEqual(r.bodySha256,parseVerdictComment(b).bodySha256);assert(!JSON.stringify(r).includes('secret-value'));
});
test('ordinary comments are not verdicts; object conversion hooks are never called', () => {
 assert.equal(parseVerdictComment('ordinary prose').kind,'not-verdict');let called=false;
 for(const x of [null,undefined,{},42,{toString(){called=true;throw Error('sensitive')}}])assert.equal(parseVerdictComment(x).kind,'malformed');assert.equal(called,false);
});
test('quoted, fenced, repeated or displaced markers cannot create a verdict', () => {
 for(const body of ['text\n'+comment(),'```\n'+comment()+'\n```',comment()+'\n\n'+marker,comment().replace(marker,marker+' trailing')])assert.equal(parseVerdictComment(body).kind,'malformed');
});
test('duplicate, missing and unknown header fields refuse', () => {
 for(const body of [comment()+'\nHead: '+fields.Head,comment()+'\nReviewer: Claude',comment().replace('Scope: '+fields.Scope,''),comment()+'\n__proto__: polluted',comment()+'\nUnknown: yes'])assert.equal(parseVerdictComment(body).kind,'malformed');
});
test('unknown action/verdict/reviewer or malformed SHA refuse without echoing input', () => {
 for(const override of [{Action:'publish-anything'},{Verdict:'approved'},{Reviewer:'Codex'},{Head:'a'.repeat(39)},{Base:'b'.repeat(41)},{Tree:'g'.repeat(40)}])assert.equal(parseVerdictComment(comment(override)).kind,'malformed');
});
test('UTF8 scope and full body budgets cannot be widened with multibyte text', () => {
 assert.equal(parseVerdictComment(comment({Scope:'💥'.repeat(256)})).kind,'parsed');
 for(const body of [comment({Scope:'💥'.repeat(257)}),comment({Scope:'bad\u0000scope'}),comment()+'\n\n'+'x'.repeat(65536)])assert.equal(parseVerdictComment(body).kind,'malformed');
});
test('only one value per inline SHA field and no trailing token are accepted', () => {
 const prefix=comment().split('\n').filter(line=>!line.startsWith('Head:')&&!line.startsWith('Base:')&&!line.startsWith('Tree:')).join('\n');
 for(const line of ['Head: '+fields.Head+' Base: '+fields.Base+' Tree: '+fields.Tree+' ignored','Head: '+fields.Head+' Base: '+fields.Base+' Head: '+fields.Head,'Head: '+fields.Head+' Base: '+fields.Base+' Tree: '+fields.Tree+' Head: '+fields.Head])assert.equal(parseVerdictComment(prefix+'\n'+line).kind,'malformed');
});
