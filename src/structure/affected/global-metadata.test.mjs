import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { parseSource } from '../syntax/parse.mjs';
import { safeGlobalCapture } from './global-metadata.mjs';

function observed(text) {
  const source=parseSource({path:'src/metadata.ts',text});
  let identifier;
  const visit=node=>{if(ts.isIdentifier(node)&&node.text==='globalThis')identifier??=node;ts.forEachChild(node,visit);};
  visit(source.sourceFile);
  assert.ok(identifier,'missing global capture fixture');
  return safeGlobalCapture(identifier);
}

test('exact lexical uses distinguish a safe metadata alias from a same-named shadow', () => {
  assert.equal(observed('const host=globalThis; function local(host){return host.require(path)}; host.BigInt?.prototype;'),true);
  assert.equal(observed('const host=globalThis; host.BigInt; consume(host);'),false);
});

test('private read-only alias proof rejects public export mutable alias writes and dynamic keys', () => {
  for(const text of ['export const host=globalThis;','const host=globalThis;export{host as exported};',
    'let host=globalThis;host.BigInt;','const host=globalThis;host.BigInt=other;',
    'const host=globalThis;host[key];','const host=globalThis;host.require(path);'])assert.equal(observed(text),false,text);
});

test('read-only proof follows nested assignment targets through wrappers and patterns',()=>{
  for(const write of ['(host as any).BigInt = other;', '[{value:host!.BigInt}]=values;',
    'for ((host as any).BigInt of values) {}', 'delete host!.BigInt;']){
    assert.equal(observed(`const host=globalThis; ${write}`),false,write);
  }
  assert.equal(observed('const host=globalThis; for(const value of host.BigInt?.prototype) {}'),true);
});
