import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { registrationFor } from './registrations.mjs';

function registration(text) {
  const parsed = parseSource({ path: 'src/a.ts', text });
  const call = parsed.sourceFile.statements.at(-1)?.expression;
  assert.ok(call, 'missing registration fixture');
  return registrationFor(call);
}

test('a real factory alias is admitted while a relative owner stays unverified', () => {
  const actual = registration("import { flowChart as chart } from 'footprintjs'; chart('R', () => {}, 'r');");
  assert.ok(actual.spec, 'missing actual factory specification');
  assert.equal(actual.spec.index, 1);
  assert.ok(registration("import { flowChart } from './builder.js'; flowChart('R', () => {}, 'r');").reason);
});

test('a local same-spelled function is unrelated rather than an imported factory', () => {
  assert.deepEqual(registration('function flowChart() {} flowChart();'), {});
});
