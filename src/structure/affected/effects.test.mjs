import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { loadEffects } from './effects.mjs';

const effects = text => parseSource({ path: 'src/a.ts', text }).sourceFile.statements.some(loadEffects);

test('literal and function constants stay inert, unlike calls or mutable module state', () => {
  assert.equal(effects('export const value = 1; export const work = () => call();'), false);
  assert.equal(effects('export const value = register();'), true);
  assert.equal(effects('let value = 1;'), true);
});

test('class headers and unsupported initialization remain conservative load effects', () => {
  assert.equal(effects('export class Store extends register() {}'), true);
  assert.equal(effects('export const object = { get value() { return read(); } };'), true);
  assert.equal(effects('export interface Shape {} export type Name = string;'), false);
});
