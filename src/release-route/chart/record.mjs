// The run's record: one JSON file per charted step, written to the folder the workflow names
// (ROUTE_RECORD_DIR). It holds what a reader needs to say why a value is what it is, from the file
// alone: the chart (as drawn), the state the run ended with, the commit log (every stage's writes,
// with the keys read before each write), the execution tree (every stage's reads), the decisions
// with the evidence decide() collected, the control edges (which decision let which stage run),
// and the story in the library's words. It holds no secret: the doors never enter state.
//
// Why a file of the snapshot and not the library's record sink (fileSink): footprintjs 12.1.0's
// sink does not declare what it collects (`opened.collects`), so foottrace's readRunEvidence reads
// every decision channel as not-collected from it; the decision evidence would be lost. The
// snapshot plus the control recorder's own snapshot carries it.
import { lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { stringifySnapshot } from 'footprintjs';
import footprintPackage from 'footprintjs/package.json' with { type: 'json' };
import foottracePackage from 'foottrace/package.json' with { type: 'json' };
import { asRefusal, refuse } from '../refusals.mjs';

export const RECORD_FORMAT = 'footprintjs-ci/release-route-record';
export const RECORD_VERSION = 1;
export const MAX_RECORD_BYTES = 8 * 1024 * 1024;
export const RECORD_FILES = Object.freeze({ plan: 'plan.record.json', verify: 'verify.record.json' });
const MAX_STORY = 400;

export function routeRecord({ step, chart, run }) {
  const { snapshot } = run;
  const failure = run.failure ? asRefusal(run.failure.error) : null;
  return {
    format: RECORD_FORMAT,
    version: RECORD_VERSION,
    step,
    runId: snapshot.runId,
    library: { footprintjs: footprintPackage.version, foottrace: foottracePackage.version },
    chart: chart.toMermaid(),
    state: snapshot.sharedState,
    initialState: snapshot.initialState,
    commitLog: snapshot.commitLog,
    executionTree: snapshot.executionTree,
    control: run.control.toSnapshot().data,
    story: run.narrative.slice(0, MAX_STORY).map((entry) => ({ type: entry.type, depth: entry.depth, text: entry.text })),
    failure: failure ? { code: failure.code, detail: failure.detail } : null,
  };
}

// Saves the record when ROUTE_RECORD_DIR is set; returns the file name written, or null when the
// variable is absent (then nothing is saved and the step still decides). Throws record-unwritten
// for anything else: a relative path, a link, a file already there, a write that fails, a record
// over its bound.
export function saveRecord(env, step, record) {
  const dir = env.ROUTE_RECORD_DIR;
  if (dir === undefined || dir === '') return null;
  if (typeof dir !== 'string' || !isAbsolute(dir) || dir.includes('\0')) refuse('record-unwritten', 'ROUTE_RECORD_DIR is not absolute');
  const name = RECORD_FILES[step];
  try {
    const text = stringifySnapshot(record);
    if (Buffer.byteLength(text) > MAX_RECORD_BYTES) refuse('record-unwritten', 'the record is over its bound');
    let stat = null;
    try { stat = lstatSync(dir); } catch { mkdirSync(dir, { recursive: true, mode: 0o700 }); }
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) refuse('record-unwritten', 'ROUTE_RECORD_DIR is not a folder');
    writeFileSync(join(dir, name), `${text}\n`, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    const refusal = asRefusal(error);
    if (refusal.code === 'record-unwritten') throw refusal;
    refuse('record-unwritten', error?.code === 'EEXIST' ? `${name} is already there` : `${name} could not be written`);
  }
  return name;
}
