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

test('Object prototype spellings do not manufacture registrations through any lookup route', () => {
  for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
    const calls = [
      `import { FlowChartBuilder } from 'footprintjs'; new FlowChartBuilder().${name}();`,
      `import { FlowChartBuilder } from 'footprintjs'; new FlowChartBuilder()['${name}']();`,
      `import { ${name} as imported } from 'footprintjs'; imported();`,
      `${name}();`,
    ];
    for (const source of calls) {
      let actual;
      assert.doesNotThrow(() => { actual = registration(source); }, `non-stage call must not throw: ${source}`);
      assert.ok(actual, 'missing registration observation');
      assert.equal(actual.spec, undefined, `non-stage call must not acquire a specification: ${source}`);
      assert.ok(!actual.reason, `non-stage call must not acquire uncertain registration provenance: ${source}`);
    }
  }
});
