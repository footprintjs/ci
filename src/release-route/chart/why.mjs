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
import { readFileSync } from 'node:fs';
import strictJson from '../archive/strict-json.cjs';
import { refuse } from '../refusals.mjs';
import { clean } from '../../shared/text.mjs';
import { MAX_RECORD_BYTES, RECORD_FORMAT, RECORD_VERSION } from './record.mjs';

const KEY = /^[A-Za-z][A-Za-z0-9]{0,40}$/;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const show = (value) => clean(JSON.stringify(value) ?? 'undefined', 80);

// Reads and checks a record file: bounded, strict JSON, the expected format and shape.
export function readRouteRecord(file) {
  let record;
  try {
    const bytes = readFileSync(file);
    record = strictJson.parseStrictJson(bytes, { maxBytes: MAX_RECORD_BYTES, maxValues: 2_000_000 });
  } catch {
    refuse('record-unreadable', 'not a readable strict JSON file within the bound');
  }
  if (record.format !== RECORD_FORMAT || record.version !== RECORD_VERSION || !['plan', 'verify'].includes(record.step) ||
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

// The lines that answer "why does `key` have its value?"; `key` is a top-level state name.
export function explain(record, key = defaultKey(record.state)) {
  if (typeof key !== 'string' || !KEY.test(key)) refuse('input-invalid', 'key');
  const { state } = record;
  const lines = [`Why ${key} = ${show(state[key])} in the ${record.step} record of run ${clean(String(record.runId), 60)}.`];
  if (!Object.hasOwn(state, key)) return [...lines, 'The run never wrote that key.'];
  const decision = record.control.decisions.find((one) => isObject(one) && isObject(one.evidence) && Array.isArray(one.evidence.rules));
  if (decision) {
    const matched = decision.evidence.rules.find((rule) => rule.matched === true);
    lines.push(`Decision at ${clean(decision.deciderRuntimeStageId, 60)}: ${matched ? `rule ${clean(matched.label, 60)} matched` : `no rule matched, default ${clean(decision.evidence.default, 60)}`}.`);
    for (const condition of matched?.conditions ?? []) {
      const reader = readerOf(record, condition.key);
      lines.push(`Fact ${clean(condition.key, 40)} ${clean(condition.op, 8)} ${show(condition.threshold)}: was ${clean(condition.actualSummary, 40)}, ` +
        `${condition.result ? 'holds' : 'does not hold'}; read by ${reader ? `${clean(reader.stage, 60)} (${clean(reader.runtimeStageId, 60)})` : 'no stage'}.`);
    }
  }
  for (const [fact, cause] of Object.entries(isObject(state.causes) ? state.causes : {}))
    lines.push(`Unreadable fact ${clean(fact, 40)}: ${clean(cause?.code, 40)} ${clean(cause?.detail, 120)}.`);
  const writer = findLastWriter(record.commitLog, key);
  if (!writer) return [...lines, 'No commit in the record wrote that key.'];
  const reads = keysReadFromExecutionTree(record.executionTree);
  const controlDeps = (id) => (Object.hasOwn(record.control.controlDeps, id) ? record.control.controlDeps[id] : undefined);
  const chain = causalChain(record.commitLog, writer.runtimeStageId, reads.lookup, { controlDeps, edgeAttribution: 'per-write' });
  lines.push('Walk back (foottrace causalChain, with the decision edges the run recorded; each ". " is one step back):');
  // Depth is shown as ". " marks after a fixed word: a printed line never starts with record text.
  if (chain) for (const line of formatCausalChain(chain).split('\n')) {
    const [, indent, text] = /^( *)(.*)$/.exec(line);
    lines.push(`Walk: ${'. '.repeat(Math.floor(indent.length / 2))}${text}`);
  }
  return lines;
}
