import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

test('CLI clears the optional TypeScript ETW module override before importing its parser', t => {
  const path = mkdtempSync(join(tmpdir(), 'structure-etw-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  const canary = join(path, 'EXECUTED');
  const module = join(path, 'canary.cjs');
  writeFileSync(module, `require('fs').writeFileSync(${JSON.stringify(canary)}, 'bad');`);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./main.mjs', import.meta.url)), 'unknown'],
    { env: { ...process.env, TS_ETW_MODULE_PATH: module }, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 2);
  assert.equal(existsSync(canary), false);
});
