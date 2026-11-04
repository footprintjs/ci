import { checkSnapshots } from './check/report.mjs';

export function checkStructure(head, base = null) {
  return checkSnapshots(head, base);
}
