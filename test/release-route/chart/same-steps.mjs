// Runs one step through the plain command and through the charted one on the same inputs and
// returns what each left behind: the exit code, every printed line, GITHUB_OUTPUT and the job
// summary. The two charted-only lines (Story:, Record:) are set apart; nothing else is.
import { runChartStep } from '../../../src/release-route/chart/cli.mjs';
import { runStep } from '../../../src/release-route/command.mjs';
import { createReport } from '../../../src/release-route/report.mjs';

const CHART_ONLY = /^(Story|Record):/;

export async function runBoth(step, makeDoors) {
  const results = [];
  for (const runner of [runStep, runChartStep]) {
    const written = {};
    const printed = [];
    const report = createReport({ env: { GITHUB_OUTPUT: 'out', GITHUB_STEP_SUMMARY: 'summary' }, print: (line) => printed.push(line),
      append: (path, text) => { written[path] = (written[path] ?? '') + text; }, appendOutputs: (path, text) => { written[path] = (written[path] ?? '') + text; } });
    const code = await runner(step, { ...makeDoors(), report, sleep: async () => {}, argv: [] });
    results.push({
      code,
      printed: printed.filter((line) => !CHART_ONLY.test(line)),
      chartOnly: printed.filter((line) => CHART_ONLY.test(line)),
      output: written.out ?? '',
      summary: (written.summary ?? '').split('\n').filter((line) => !CHART_ONLY.test(line)).join('\n'),
    });
  }
  const [plain, chart] = results;
  return { plain, chart };
}
