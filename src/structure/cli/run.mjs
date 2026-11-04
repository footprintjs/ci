import { readGitSnapshot } from '../sources/git/index.mjs';
import { formatReport } from '../reporters/index.mjs';
import { parseOptions } from './options.mjs';
import { analyzeCommand } from './analyze.mjs';

export function runCli(args, io = { stdout: value => process.stdout.write(value), stderr: value => process.stderr.write(value) }) {
  try {
    const options = parseOptions(args);
    const head = readGitSnapshot(options.repo, options.head);
    const base = options.base ? readGitSnapshot(options.repo, options.base) : undefined;
    const report = analyzeCommand(options.command, head, base);
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
