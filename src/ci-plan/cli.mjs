import { appendFile, writeFile } from 'node:fs/promises';
import { gatherGithubFacts, githubRead, receiptSources } from './github-facts.mjs';
import { runObserveChart } from './observe-chart.mjs';
import { createReceiptVerifier } from './receipt-verifier.mjs';

const escape = value => String(value ?? '').replace(/[&<>]/g, key => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[key]);
const cellText = value => escape(value).replace(/[\r\n\u0000-\u001f]/g, ' ').replaceAll('|', '&#124;');
function summary(record, json) {
  const labels = new Map((record.cells ?? []).map(cell => [cell.id, cell.label]));
  const heading = [
    '## CI plan · Observe', '', 'Every existing check runs. These decisions are informational.', '',
    '**Tree** `' + record.tree + '`', '**Evidence** ' + record.evidenceStatus, '',
    record.coverage, '',
    '| Check cell | Decision | Rule | Reason |', '|---|---|---|---|',
  ];
  const rows = record.decisions.map(row => '| ' + [
    labels.get(row.cell) ?? row.cell, row.decision, row.rule ?? '—', row.reason,
  ].map(cellText).join(' | ') + ' |');
  if (!rows.length) rows.push('| All checks | run | — | No check cells were visible when the plan ran |');
  return [...heading, ...rows, '', '<details><summary>Decision record</summary>', '',
    '<pre>' + escape(json) + '</pre>', '', '</details>', ''].join('\n');
}

const { GITHUB_STEP_SUMMARY, GH_TOKEN, CI_PLAN_RECORD_PATH } = process.env;
if (!GITHUB_STEP_SUMMARY || !GH_TOKEN || !CI_PLAN_RECORD_PATH) throw new Error('Expected a hosted observe job');
const verifier = createReceiptVerifier(receiptSources());
const record = await runObserveChart(() => gatherGithubFacts(process.env, githubRead(GH_TOKEN)), verifier.isVerifiedReceipt);
const json = JSON.stringify(record, null, 2);
await appendFile(GITHUB_STEP_SUMMARY, summary(record, json));
await writeFile(CI_PLAN_RECORD_PATH, json + '\n', { flag: 'wx' });
