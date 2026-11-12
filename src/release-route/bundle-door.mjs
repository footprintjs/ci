// Opening the charted steps' bundle (dist/release-route.cjs) from a plain checkout. The file must
// be the one its metadata names (sha256). What that catches: a bundle cut short, damaged or missing
// after checkout. What it does NOT catch: someone who can write to the checkout (the metadata sits
// beside the bundle and can be changed with it, and the file is read a second time when it is
// loaded). What makes the bundle the reviewed code is the review of the commit and CI's check that
// the committed bundle equals a rebuild of the reviewed source. A bundle that will not load is a
// named refusal, not a stack trace. Built-in Node modules only.
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
