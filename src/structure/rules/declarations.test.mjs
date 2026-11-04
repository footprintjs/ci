import assert from 'node:assert/strict';
import test from 'node:test';
import { declarationFindings, NAME_EXEMPTIONS } from './declarations.mjs';

test('numeric export aliases are checked even when the private name is descriptive', () => {
  const source = { path: 'src/a.ts', topLevelLets: [], exports: [{ name: 'handler2', line: 1 }] };
  assert.ok(declarationFindings(source).some(item => item.rule === 'number-suffixed-export'));
  assert.ok(Object.isFrozen(NAME_EXEMPTIONS));
  for (const item of NAME_EXEMPTIONS) assert.ok(item.reason && item.evidence);
});

test('observed algorithm names keep their bit-width suffix without exempting arbitrary variants', () => {
  const names = ['crc32', 'sha256', 'crc322', 'sha2562', 'decideTier2', 'pad2'];
  const source = { path: 'src/algorithms.ts', topLevelLets: [],
    exports: names.map((name, index) => ({ name, line: index + 1 })) };
  assert.deepEqual(declarationFindings(source).filter(item => item.rule === 'number-suffixed-export')
    .map(item => item.name), ['crc322', 'sha2562', 'decideTier2', 'pad2']);
  for (const name of ['crc32', 'sha256']) {
    const entry = NAME_EXEMPTIONS.find(item => item.name === name);
    assert.ok(entry, `missing observed algorithm exemption: ${name}`);
    assert.ok(entry.reason && entry.evidence);
    assert.ok(Object.isFrozen(entry));
  }
});
