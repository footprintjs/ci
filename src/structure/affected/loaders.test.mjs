import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { loadingRequests } from './loaders.mjs';

const loading = text => loadingRequests(parseSource({ path: 'src/a.ts', text }),
  { files: new Map([['src/leaf.ts', { text: '' }]]), packages: new Set() });

test('literal direct loaders retain their actual tracked source target', () => {
  const result = loading('require("./leaf.js"); import("./leaf.js");');
  assert.deepEqual(result.requests.map(item => item.target), ['src/leaf.ts', 'src/leaf.ts']);
  assert.deepEqual(result.unverified, []);
});

test('loader aliases and reflection are uncertain while a shadowed require is unrelated', () => {
  assert.ok(loading('const load = require; load(path);').unverified.length);
  assert.ok(loading('eval(text);').unverified.length);
  assert.ok(loading('module.require(path);').unverified.length);
  assert.ok(loading('globalThis[chosen](path);').unverified.length);
  assert.deepEqual(loading('function require(value) {} require(path);'), { requests: [], unverified: [] });
});

for (const text of ['const load = globalThis.require; load("./leaf.js");',
  'const load = module["require"]; load("./leaf.js");',
  'const evaluate = eval; evaluate(source);', '(0, eval)(source);',
  'const Compile = Function; new Compile(source);',
  'const evaluate = globalThis["eval"]; evaluate(source);',
  'const root = globalThis; root.require("./leaf.js");',
  'const { require: load } = module; load("./leaf.js");']) {
  test(`captured or indirect global loading stays uncertain: ${text}`, () => {
    assert.ok(loading(text).unverified.length, text);
  });
}

test('lexically shadowed loader spellings are unrelated to global loading', () => {
  assert.deepEqual(loading('function use(eval, Function, globalThis, module) { const run = eval; const build = Function; const load = globalThis.require; return module.require; }'),
    { requests: [], unverified: [] });
});

test('transparent type wrappers around a safe global property are not a captured loader container', () => {
  for (const text of ['const host = (globalThis as { process?: unknown }).process;',
    'const bytes = (globalThis as any).Buffer;', 'const clock = (globalThis!).performance;',
    'type Global = typeof globalThis; type Loader = typeof require;',
    'const present = typeof require === "function";']) assert.deepEqual(loading(text).unverified, [], text);
});

test('type wrappers do not hide actual loader capture', () => {
  assert.ok(loading('const load = (globalThis as any).require; load(path);').unverified.length);
  assert.ok(loading('const host = (globalThis as any); host.require(path);').unverified.length);
});

test('an unescaped readonly const alias with only finite non-loader property reads matches direct access', () => {
  for(const text of ['const host = globalThis as unknown as Record<string,unknown>; host.BigInt?.prototype; host.SharedArrayBuffer?.prototype;',
    'const host = globalThis; host["BigInt"]?.prototype;',
    'const host = globalThis; function read(){ return host.SharedArrayBuffer?.prototype; }']){
    assert.deepEqual(loading(text).unverified,[],text);
  }
});

test('global metadata alias proof does not credit escape write dynamic access or loader properties', () => {
  for(const text of ['const host=globalThis; consume(host); host.BigInt;',
    'const host=globalThis; host.BigInt=replacement;',
    'const host=globalThis; host[chosen];', 'const host=globalThis; host["require"](path);',
    'const host=globalThis; host.Function(source);', 'const host=globalThis; host.eval(source);',
    'let host=globalThis; host.BigInt;', 'export const host=globalThis;',
    'const host=globalThis; export {host};',
    'const host=globalThis; const alias=host; alias.require(path);'])assert.ok(loading(text).unverified.length,text);
});

test('a native-brand-derived dynamic global constructor remains unresolved', () => {
  const text='const tag=Object.prototype.toString.call(child).slice(8,-1); const Ctor=(globalThis as unknown as Record<string,new (b:ArrayBuffer)=>ArrayBufferView>)[tag]; if(typeof Ctor==="function")new Ctor(bytes);';
  assert.ok(loading(text).unverified.length);
});
