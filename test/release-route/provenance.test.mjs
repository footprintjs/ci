// The archive inspector is borrowed code: every copied file is pinned with its source hash and
// its current hash, and a changed file must say how it was adapted. A file that drifts without
// an update here turns this test red.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const record = JSON.parse(readFileSync('provenance/release-route-archive.json', 'utf8'));
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((item) =>
  item.isDirectory() ? walk(join(dir, item.name)) : [join(dir, item.name)]);
// Written for the route, not borrowed: the archive setting's one owner.
const OWN = new Set(['src/release-route/archive/allowed.cjs']);

test('every pinned file has the hash the record states, and an exact copy equals its source', () => {
  assert.match(record.commit, /^[a-f0-9]{40}$/);
  for (const file of record.files) {
    assert.equal(sha256(file.destination), file.sha256, file.destination);
    if (file.adaptation === 'exact') assert.equal(file.sha256, file.sourceSha256, file.destination);
    else assert.ok(file.adaptation.length > 10, `${file.destination} names its adaptation`);
  }
});

test('every file in the copied folders is pinned or is the route\'s own', () => {
  const pinned = new Set(record.files.map((file) => file.destination));
  for (const path of [...walk('src/release-route/archive'), ...walk('test/release-route/archive')])
    assert.ok(pinned.has(path) || OWN.has(path), `${path} is neither pinned nor listed as the route's own`);
});
