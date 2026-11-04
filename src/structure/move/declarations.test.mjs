import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { declarationKinds,declarationNames,importBinding } from './declarations.mjs';

test('public declaration spaces distinguish values types and merged class spaces',()=>{
  const parsed=parseSource({path:'src/a.ts',text:'export class Gate{} export interface Shape{} export function run(){} const {first:chosen}=input;'});
  const nodes=[...parsed.sourceFile.statements];
  assert.deepEqual(nodes.slice(0,3).map(declarationKinds),[['type','value'],['type'],['value']]);
  assert.deepEqual(declarationNames(nodes[3]),['chosen']);
});

test('a type-only renamed import retains its actual source name and import space',()=>{
  const parsed=parseSource({path:'src/a.ts',text:"import type {Shape as Local} from './types.js';"});
  const node=parsed.sourceFile.statements[0].importClause.namedBindings.elements[0];
  assert.deepEqual(importBinding(node),{specifier:'./types.js',name:'Shape',typeOnly:true});
});
