import { checkSnapshots } from '../check/report.mjs';
import { affectedTests } from '../affected/index.mjs';
import { verifyMove } from '../move/verify.mjs';

const commands = new Map([['report', checkSnapshots], ['affected', affectedTests],
  ['verify-move', (head, base) => verifyMove({ head, base })]]);

export function analyzeCommand(command, head, base) {
  return commands.get(command)(head, base);
}
