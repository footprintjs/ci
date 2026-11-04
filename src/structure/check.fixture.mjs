import assert from 'node:assert/strict';

export function snapshot(files, id = 'head') {
  return { id, files: Object.entries(files).map(([path, text]) => ({ path, text })) };
}

export function reportOf(value) {
  assert.ok(value && typeof value === 'object', 'missing structure report');
  assert.ok(Array.isArray(value.findings), 'missing report.findings');
  assert.ok(value.coverage && typeof value.coverage === 'object', 'missing report.coverage');
  assert.equal(typeof value.coverage.complete, 'boolean', 'missing coverage completeness');
  assert.ok(Array.isArray(value.coverage.unverified), 'missing coverage.unverified');
  assert.ok(Array.isArray(value.historicalReferences), 'missing historical references');
  return value;
}

export function finding(report, rule, path) {
  const found = report.findings.find(item => item.rule === rule && item.path === path);
  assert.ok(found, `missing ${rule} finding in ${path}`);
  return found;
}

export function noFindings(report, rules) {
  assert.deepEqual(report.findings.filter(item => rules.includes(item.rule)), []);
}

export function unverified(report, kind, path) {
  const found = report.coverage.unverified.find(item => item.kind === kind && item.path === path);
  assert.ok(found, `missing ${kind} incomplete observation in ${path}`);
  assert.equal(report.coverage.complete, false);
  return found;
}

export function functionText({ name = 'stage', lines = 40, branches = 0 } = {}) {
  assert.ok(lines >= branches + 2, 'fixture needs room for its branch statements');
  return [`function ${name}(scope) {`, ...Array(branches).fill('  if (scope.ready) scope.use();'),
    ...Array(lines - branches - 2).fill('  scope.use();'), '}'].join('\n');
}
