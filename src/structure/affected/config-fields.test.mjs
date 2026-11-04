import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { configProperty, literalSetups } from './config-fields.mjs';

const object = text => parseSource({path:'config.ts',text:`const config = ${text};`})
  .sourceFile.statements[0].declarationList.declarations[0].initializer;

test('duplicate, computed, and spread fields cannot establish a literal configuration value', () => {
  for(const text of ["{include:['test/*.ts'],include:chosen}","{include:['test/*.ts'],...extra}","{include:['test/*.ts'],[key]:other}"]){
    assert.equal(configProperty(object(text),'include'),null);
  }
});

test('shared setup strings and arrays retain all distinct roots while duplicate setup fields stay unknown', () => {
  assert.deepEqual(literalSetups(object("{setupFiles:['a.ts','b.ts'],globalSetup:'a.ts'}")),{paths:['a.ts','b.ts']});
  assert.ok(literalSetups(object("{setupFiles:['a.ts'],setupFiles:chosen}")).reason);
});
