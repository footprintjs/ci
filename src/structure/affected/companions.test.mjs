import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { erasedCompanions } from './companions.mjs';

test('only erased companions disappear, never actual runtime implementations', () => {
  const parsed=parseSource({path:'src/a.ts',text:'export function work(x:string):string; export function work(x:any){return x;} export function work(){return 2;}'});
  const ignored=erasedCompanions(parsed.sourceFile);
  assert.equal(ignored.size,1);
  assert.equal(parsed.sourceFile.statements.filter(node=>!ignored.has(node)).length,2);
});

test('a standalone type owner is retained while an erased companion shares an existing value binding', () => {
  const parsed=parseSource({path:'src/a.ts',text:'interface OnlyType {} interface Value {} const Value=1;'});
  const ignored=erasedCompanions(parsed.sourceFile);
  assert.equal(ignored.has(parsed.sourceFile.statements[0]),false);
  assert.equal(ignored.has(parsed.sourceFile.statements[1]),true);
});
