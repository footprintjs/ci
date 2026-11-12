// The publish job's last question before `npm publish`: does npm already have this version?
// It answers what a re-run needs, so the workflow writes no logic of its own:
//   npm does not have it                          -> publish=yes
//   npm has it, integrity and served bytes equal  -> publish=no  (a re-run after npm accepted:
//                                                                 go on to verify, tag, release)
//   npm has it with other bytes                   -> refuse registry-differs
// The decision is the pure `decideReady`; `ready` gathers its three facts through the registry
// doors (no wait: a version npm does not show yet is "not there", and publishing it again is
// refused by npm itself, never accepted twice).
import { downloadTarball, integrityOf, readDist } from './registry.mjs';
import { refuse } from './refusals.mjs';

export function decideReady({ npmHasVersion, integrityEqual, bytesEqual }) {
  if (npmHasVersion === false) return 'yes';
  if (npmHasVersion !== true) refuse('fact-unreadable', 'npmHasVersion');
  if (integrityEqual !== true) refuse('registry-differs', 'integrity');
  if (bytesEqual !== true) refuse('registry-differs', 'tarball bytes');
  return 'no';
}

export async function ready({ fetcher, name, version, localBytes }) {
  const local = integrityOf(localBytes);
  const dist = await readDist({ fetcher, name, version });
  if (dist === null) return decideReady({ npmHasVersion: false });
  const integrityEqual = dist.integrity === local;
  const bytesEqual = integrityEqual ? integrityOf(await downloadTarball({ fetcher, url: dist.tarball })) === local : false;
  return decideReady({ npmHasVersion: true, integrityEqual, bytesEqual });
}
