import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateMeasurements } from './index.mjs';
import { measured, callable } from './index.fixture.mjs';

const callableRules = [
  ['function-lines', 'codeLines', 60, false],
  ['function-lines', 'codeLines', 120, true],
  ['complexity', 'complexity', 15, false],
  ['nesting', 'depth', 4, false],
  ['parameters', 'parameters', 4, false],
];

for (const [rule, metric, limit, jsx] of callableRules) {
  test(`${rule} at ${limit} is allowed (jsx=${jsx})`, () => {
    const source = measured({ functions: [callable({ [metric]: limit, jsx })] });
    assert.equal(evaluateMeasurements(source).some(row => row.rule === rule), false);
  });
  test(`${rule} above ${limit} reports the real limit (jsx=${jsx})`, () => {
    const source = measured({ functions: [callable({ [metric]: limit + 1, jsx })] });
    const finding = evaluateMeasurements(source).find(row => row.rule === rule);
    assert.ok(finding, 'Expected an actual structural finding');
    assert.equal(finding.value, limit + 1);
    assert.equal(finding.limit, limit);
    assert.equal(finding.excess, 1);
  });
}

test('a class at 300 code lines is allowed', () => {
  assert.deepEqual(evaluateMeasurements(measured({ classes: [callable({ codeLines: 300 })] })), []);
});

test('a class over 300 code lines is reported', () => {
  const rows = evaluateMeasurements(measured({ classes: [callable({ codeLines: 301 })] }));
  assert.ok(rows.some(row => row.rule === 'class-lines' && row.value === 301));
});

for (const [metric, rule, limit] of [
  ['physicalLines', 'file-physical-lines', 600], ['codeLines', 'file-code-lines', 300],
]) {
  test(`${rule} at the limit is allowed`, () => {
    assert.deepEqual(evaluateMeasurements(measured({ [metric]: limit })), []);
  });
  test(`${rule} above the limit is reported`, () => {
    const rows = evaluateMeasurements(measured({ [metric]: limit + 1 }));
    assert.ok(rows.some(row => row.rule === rule && row.excess === 1));
  });
}

test('top-level let is reported as module state', () => {
  const rows = evaluateMeasurements(measured({ topLevelLets: [{ name: 'active', line: 2 }] }));
  assert.ok(rows.some(row => row.rule === 'module-state' && row.name === 'active'));
});

test('a numeric export suffix is reported', () => {
  const rows = evaluateMeasurements(measured({ exports: [{ name: 'handler2', kind: 'function', line: 1 }] }));
  assert.ok(rows.some(row => row.rule === 'number-suffixed-export'));
});

test('a descriptive export name is allowed', () => {
  assert.deepEqual(evaluateMeasurements(measured({ exports: [{ name: 'handleResult', kind: 'function', line: 1 }] })), []);
});

test('misc is a catch-all filename', () => {
  assert.ok(evaluateMeasurements(measured({ path: 'src/misc.ts' })).some(row => row.rule === 'catch-all-file'));
});

test('temperature does not match the temp basename', () => {
  assert.deepEqual(evaluateMeasurements(measured({ path: 'src/temperature.ts' })), []);
});
