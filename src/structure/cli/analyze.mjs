import { checkSnapshots } from '../check/report.mjs';
import { affectedTests } from '../affected/index.mjs';

const commands = new Map([['report', checkSnapshots], ['affected', affectedTests]]);

export function analyzeCommand(command, head, base) {
  return commands.get(command)(head, base);
}
