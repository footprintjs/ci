// Opening the charted steps' bundle (dist/release-route.cjs) from a plain checkout. The file must
// be the one its metadata names (sha256): CI already proves the committed bundle equals a rebuild
// of the reviewed source, and this check refuses a bundle changed or cut short after checkout.
// A bundle that will not load is a named refusal, not a stack trace. Built-in Node modules only.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { refuse } from './refusals.mjs';

const SHA256 = /^[0-9a-f]{64}$/;

// Loads the bundle (which then runs the step named in process.argv); throws bundle-unloadable.
export function openBundle({ bundle, metadata, load = createRequire(import.meta.url) }) {
  let bytes;
  let recorded;
  try {
    bytes = readFileSync(bundle);
    recorded = JSON.parse(readFileSync(metadata, 'utf8')).sha256;
  } catch {
    refuse('bundle-unloadable', 'the bundle or its metadata could not be read');
  }
  if (typeof recorded !== 'string' || !SHA256.test(recorded) || createHash('sha256').update(bytes).digest('hex') !== recorded)
    refuse('bundle-unloadable', 'the bundle is not the file its metadata names');
  try {
    load(bundle);
  } catch {
    refuse('bundle-unloadable', 'the bundle threw while loading');
  }
}
