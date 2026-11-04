import assert from 'node:assert/strict';
import test from 'node:test';
import { discoverDoors } from './doors.mjs';
import { trackedFiles } from './paths.mjs';

test('differently cased seals and explicit package source doors are discovered as data', () => {
  const files = trackedFiles({ files: Object.entries({
    'src/Agent.ts': '', 'src/agent/run.ts': '', 'src/trace.ts': '',
    'package.json': '{"exports":{"./trace":"./dist/trace.js"}}',
  }).map(([path, text]) => ({ path, text })) });
  const result = discoverDoors(files);
  assert.deepEqual(result.seals, [{ facade: 'src/Agent.ts', folder: 'src/agent/' }]);
  assert.ok(result.paths.has('src/trace.ts'));
});

test('a sealed sibling folder may contain tracked data without another source file', () => {
  const files = trackedFiles({ files: [{ path: 'src/config.ts', text: '' },
    { path: 'src/config/data.json', text: '{}' }] });
  assert.deepEqual(discoverDoors(files).seals, [{ facade: 'src/config.ts', folder: 'src/config/' }]);
});
