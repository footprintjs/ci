// The generated parts of docs/RELEASE-ROUTE-CHART.md, made from the real charts: each chart's
// toMermaid() and the table of its stages. doc-chart.test.mjs fails when the doc differs.
import { FIRST_LOOKS, SECOND_LOOKS, buildPlanChart } from '../../../src/release-route/chart/plan-chart.mjs';
import { DECIDE } from '../../../src/release-route/chart/stages/decide.mjs';
import { gather } from '../../../src/release-route/chart/stages/gather.mjs';
import { REQUEST } from '../../../src/release-route/chart/stages/request.mjs';
import { WEIGH } from '../../../src/release-route/chart/stages/weigh.mjs';
import { ASK } from '../../../src/release-route/chart/verify/ask.mjs';
import { BUILT } from '../../../src/release-route/chart/verify/built.mjs';
import { COMPARE, WEIGH_BYTES } from '../../../src/release-route/chart/verify/compare.mjs';
import { DOWNLOAD } from '../../../src/release-route/chart/verify/download.mjs';
import { buildVerifyChart } from '../../../src/release-route/chart/verify-chart.mjs';

const mermaid = (chart) => ['```mermaid', chart.toMermaid(), '```'].join('\n');
const table = (stages) => ['| Stage id | Name | Description |', '|---|---|---|',
  ...stages.map((stage) => `| \`${stage.id}\` | ${stage.name} | ${stage.description} |`)].join('\n');

export const DRAWINGS = Object.freeze({
  'plan-drawing': mermaid(buildPlanChart({})),
  'plan-stages': table([REQUEST, ...FIRST_LOOKS, gather('gather-first', []), ...SECOND_LOOKS, gather('gather-second', []), WEIGH, DECIDE]),
  'verify-drawing': mermaid(buildVerifyChart({})),
  'verify-stages': table([BUILT, ASK, DOWNLOAD, WEIGH_BYTES, COMPARE]),
});

// Replaces each <!-- name --> ... <!-- /name --> block of `text` with its generated content.
export const regenerate = (text) => Object.entries(DRAWINGS).reduce((doc, [name, body]) =>
  doc.replace(new RegExp(`<!-- ${name} -->[\\s\\S]*?<!-- /${name} -->`), `<!-- ${name} -->\n${body}\n<!-- /${name} -->`), text);
