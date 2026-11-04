import assert from 'node:assert/strict';
import test from 'node:test';
import { FACTORIES, METHODS, nextReceiver } from './methods.mjs';

test('factory branch and handler positions match the actual published builder doors', () => {
  for (const name of ['addFunctionBranch', 'addPausableFunctionBranch', 'addListOfFunction']) assert.ok(METHODS[name]);
  assert.ok(FACTORIES.flowChart);
  assert.equal(FACTORIES.flowChart.index, 1);
  assert.equal(METHODS.addFunctionBranch.index, 2);
  assert.equal(METHODS.addPausableFunctionBranch.index, 2);
  assert.equal(METHODS.addListOfFunction.index, 0);
  assert.equal(nextReceiver('addDeciderFunction', 'builder'), 'decider');
  assert.equal(nextReceiver('addFunctionBranch', 'decider'), 'decider');
  assert.equal(nextReceiver('end', 'selector'), 'builder');
  assert.equal(nextReceiver('setDefault', 'selector'), 'unknown');
});

test('inherited Object names are neither factory nor builder-method specifications', () => {
  for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
    assert.equal(FACTORIES[name], undefined, `not a factory: ${name}`);
    assert.equal(METHODS[name], undefined, `not a stage method: ${name}`);
    let next;
    assert.doesNotThrow(() => { next = nextReceiver(name, 'builder'); }, `non-stage method must not throw: ${name}`);
    assert.equal(next, 'unknown');
  }
});
