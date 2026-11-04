import { formatReport } from '../reporters/index.mjs';
import { parseOptions } from './options.mjs';
import { observeCommand } from './observe.mjs';

export function runCli(args, io = { stdout: value => process.stdout.write(value), stderr: value => process.stderr.write(value) }) {
  try {
    const options = parseOptions(args);
    const report = observeCommand(options);
    if (report.coverage.unverified.some(item => item.kind === 'parse-error')) {
      throw new Error('Candidate contains syntax errors; the report is not a valid source measurement.');
    }
    io.stdout(formatReport(report, options.format));
    return 0;
  } catch (error) {
    io.stderr(JSON.stringify({ status: 'tool-error', message: error.message }) + '\n');
    return 2;
  }
}
