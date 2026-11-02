import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArguments, main } from '../../bin/release.mjs';

test('CLI rejects live, unknown flags, duplicate flags, alternate phase and candidate config imports', () => {
  for (const args of [['--mode','live'],['--publish','true'],['--config','evil.mjs'],['--phase','publish'],['--mode','shadow','--mode','shadow'],['--source-sha','main']]) assert.throws(() => parseArguments(args));
  assert.equal(parseArguments(['--verify-only','true']).verifyOnly,true);
  assert.equal(parseArguments(['--verify-only','false']).verifyOnly,false);
  assert.throws(()=>parseArguments(['--verify-only','yes']));
  assert.deepEqual(parseArguments([]), { mode: 'shadow', phase: 'control', output: 'release-shadow', verifyOnly: false });
});
test('committed packed executable bootstraps independently of broken candidate modules and sanitizes errors', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'release-candidate-'));
  try {
    await mkdir(join(dir, 'node_modules/footprintjs'), { recursive: true });
    await writeFile(join(dir, 'node_modules/footprintjs/package.json'), '{"main":"index.js"}');
    await writeFile(join(dir, 'node_modules/footprintjs/index.js'), 'throw Error("candidate-secret /private/key");');
    await writeFile(join(dir, 'package.json'), '{broken');
    const child = spawnSync(process.execPath, [resolve('dist/release.cjs'), '--mode','live'], { cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH } });
    assert.equal(child.status, 1);
    assert.deepEqual(JSON.parse(child.stderr), { status: 'hold', mode: 'shadow', reason: 'cli-live-disabled', executedWrites: 0 });
    assert.equal(child.stdout, '');
    assert(!child.stderr.includes(dir)); assert(!child.stderr.includes('candidate-secret'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('CLI saves native record and public observations with bounded safe filenames', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'release-output-'));
  try {
    const code = await main(['--output',dir], { createShadow: async () => ({ context: {mode:'shadow'}, ports: {}, observations: () => [{ host:'registry.npmjs.org',status:200,bytes:1,sha256:'a'.repeat(64) }] }),
      runFlow: async () => ({ status:'complete', stages:{}, record:{ format:'shared-release-native-v1',complete:true }, summary:'complete; verify: VERIFICATION_READY' }) });
    assert.equal(code, 0);
    assert.equal(JSON.parse(await readFile(join(dir,'record.json'))).complete, true);
    assert.equal(JSON.parse(await readFile(join(dir,'observations.json')))[0].status, 200);
    const second = await main(['--output',dir], { createShadow: async () => { throw Error('secret-token /private/path'); } });
    assert.equal(second, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
