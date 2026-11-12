// The `why` reader: from a saved record alone, with no network, why a key (default: `mode`, or
// `refusal` when the run refused) has the value it has. Every walk is foottrace's own:
// findLastWriter for who wrote a value, causalChain + formatCausalChain for the walk back (with
// the control edges the record kept, so a value leads to the decision that let its stage run),
// keysReadFromExecutionTree for what each stage read. This file only reads the record and
// arranges those answers into lines; it writes no second walk.
//
// The record is data from a run that read outside text (names, npm's answers): every line is
// cleaned before it is printed (report.mjs · safeLine), and nothing in it is an instruction.
import { causalChain, findLastWriter, formatCausalChain, keysReadFromExecutionTree } from 'foottrace';
import { normaliseStateKey } from 'foottrace/paths';
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import strictJson from '../archive/strict-json.cjs';
import { refuse } from '../refusals.mjs';
import { clean } from '../../shared/text.mjs';
import { MAX_RECORD_BYTES, RECORD_FORMAT, RECORD_VERSION } from './record.mjs';

const KEY = /^[A-Za-z][A-Za-z0-9]{0,40}$/;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const show = (value) => clean(JSON.stringify(value) ?? 'undefined', 80);

// Reads a file once, through one descriptor: opened without waiting (a FIFO would block a plain
// open), then fstat on THAT descriptor (so the check and the read are about the same file): a
// regular file within the bound, read up to the bound and no further. Anything else is refused
// before a byte is read (a device such as /dev/zero, a FIFO, a folder, a file over the bound).
function readBounded(file) {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_RECORD_BYTES) throw new Error('not a regular file within the bound');
    const bytes = Buffer.alloc(stat.size);
    let read = 0;
    while (read < bytes.length) {
      const got = readSync(fd, bytes, read, bytes.length - read, read);
      if (got === 0) break;
      read += got;
    }
    return bytes.subarray(0, read);
  } finally {
    closeSync(fd);
  }
}

// Reads and checks a record file: bounded, strict JSON, the expected format and shape.
export function readRouteRecord(file) {
  let record;
  try {
    record = strictJson.parseStrictJson(readBounded(file), { maxBytes: MAX_RECORD_BYTES, maxValues: 2_000_000 });
  } catch {
    refuse('record-unreadable', 'not a readable strict JSON file within the bound');
  }
  if (!isObject(record) || record.format !== RECORD_FORMAT || record.version !== RECORD_VERSION || !['plan', 'verify'].includes(record.step) ||
      !isObject(record.state) || !Array.isArray(record.commitLog) || !isObject(record.executionTree) || !isObject(record.control) ||
      !isObject(record.control.controlDeps) || !Array.isArray(record.control.decisions)) refuse('record-unreadable', 'not a release route record');
  return record;
}

const defaultKey = (state) => ['mode', 'refusal', 'verified'].find((key) => Object.hasOwn(state, key)) ?? 'rule';

// Which stage first read a fact: the look whose own writes under runs/<id>/ hold it, or, for the
// request's facts, the stage that wrote the name itself.
function readerOf(record, fact) {
  const runs = isObject(record.state.runs) ? record.state.runs : {};
  for (const id of Object.keys(runs)) {
    if (!isObject(runs[id]) || !Object.hasOwn(runs[id], fact)) continue;
    const writer = findLastWriter(record.commitLog, normaliseStateKey(['runs', id, fact]));
    if (writer) return writer;
  }
  return findLastWriter(record.commitLog, fact);
}

// Until the library tells apart steps that ran side by side (foottrace causalChain reads a fork's
// `runs` namespace as one key), the walk may show such steps one under another. Said once, above
// every walk; nothing here filters or redraws the library's walk.
export const SIDE_BY_SIDE = 'Note: steps that ran side by side may be shown one under another; only the "read by" lines above say which step read a fact.';

// The decision that governs a key: the one whose branch let the key's last writer run (the
// record's control edges, controlDeps[writer]). A writer under no decision ran on every path, so no
// rule is named for it.
function decisionLines(record, key, writer) {
  if (!writer) return [];
  const edge = Object.hasOwn(record.control.controlDeps, writer.runtimeStageId) ? record.control.controlDeps[writer.runtimeStageId] : undefined;
  const decision = isObject(edge) ? record.control.decisions.find((one) => isObject(one) && one.deciderRuntimeStageId === edge.deciderId) : undefined;
  if (!decision || !isObject(decision.evidence) || !Array.isArray(decision.evidence.rules))
    return [`No decision governs ${key}: ${clean(writer.stage, 60)} (${clean(writer.runtimeStageId, 60)}) wrote it, and that stage runs whatever is decided.`];
  const matched = decision.evidence.rules.find((rule) => isObject(rule) && rule.matched === true);
  const lines = [`Decision at ${clean(decision.deciderRuntimeStageId, 60)}: ${matched ? `rule ${clean(matched.label, 60)} matched` : `no rule matched, default ${clean(decision.evidence.default, 60)}`}.`];
  for (const condition of Array.isArray(matched?.conditions) ? matched.conditions : []) {
    const reader = readerOf(record, condition.key);
    lines.push(`Fact ${clean(condition.key, 40)} ${clean(condition.op, 8)} ${show(condition.threshold)}: was ${clean(condition.actualSummary, 40)}, ` +
      `${condition.result ? 'holds' : 'does not hold'}; read by ${reader ? `${clean(reader.stage, 60)} (${clean(reader.runtimeStageId, 60)})` : 'no stage'}.`);
  }
  return lines;
}

// The lines that answer "why does `key` have its value?"; `key` is a top-level state name.
export function explain(record, key = defaultKey(record.state)) {
  if (typeof key !== 'string' || !KEY.test(key)) refuse('input-invalid', 'key');
  const { state } = record;
  const lines = [`Why ${key} = ${show(state[key])} in the ${record.step} record of run ${clean(String(record.runId), 60)}.`];
  if (!Object.hasOwn(state, key)) return [...lines, 'The run never wrote that key.'];
  const writer = findLastWriter(record.commitLog, key);
  lines.push(...decisionLines(record, key, writer));
  for (const [fact, cause] of Object.entries(isObject(state.causes) ? state.causes : {}))
    lines.push(`Unreadable fact ${clean(fact, 40)}: ${clean(cause?.code, 40)} ${clean(cause?.detail, 120)}.`);
  if (!writer) return [...lines, 'No commit in the record wrote that key.'];
  const reads = keysReadFromExecutionTree(record.executionTree);
  const controlDeps = (id) => (Object.hasOwn(record.control.controlDeps, id) ? record.control.controlDeps[id] : undefined);
  const chain = causalChain(record.commitLog, writer.runtimeStageId, reads.lookup, { controlDeps, edgeAttribution: 'per-write' });
  lines.push('Walk back (foottrace causalChain, with the decision edges the run recorded; each ". " is one step back):');
  lines.push(SIDE_BY_SIDE);
  // Depth is shown as ". " marks after a fixed word: a printed line never starts with record text.
  if (chain) for (const line of formatCausalChain(chain).split('\n')) {
    const [, indent, text] = /^( *)(.*)$/.exec(line);
    lines.push(`Walk: ${'. '.repeat(Math.floor(indent.length / 2))}${text}`);
  }
  return lines;
}
