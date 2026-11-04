import { checkSnapshots } from '../check/report.mjs';
import { affectedTests } from '../affected/index.mjs';

function affectedReport(head, base) {
  return { ...affectedTests(head, base), headId: head.id ?? null, baseId: base.id ?? null };
}

const commands = new Map([['report', checkSnapshots], ['affected', affectedReport]]);

export function analyzeCommand(command, head, base) {
  return commands.get(command)(head, base);
}
