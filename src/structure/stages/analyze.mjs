import ts from 'typescript';
import { registrationFor } from './registrations.mjs';
import { collectCallbacks } from './callbacks.mjs';
import { stageFindings } from './measure.mjs';

function recordRegistration({ call, registration, parsed, source, result, units }) {
  const start = call.getStart(parsed.sourceFile);
  const line = parsed.sourceFile.getLineAndCharacterOfPosition(start).line + 1;
  const unknown = reason => result.unverified.push({ kind: 'stage-binding', path: parsed.path, line, reason });
  if (registration.reason) return unknown(registration.reason);
  if (!registration.spec) return;
  const callbacks = collectCallbacks(call.arguments[registration.spec.index], registration.spec.mode);
  callbacks.reasons.forEach(unknown);
  for (const node of callbacks.nodes) {
    const unit = units.get(node.getStart(parsed.sourceFile));
    if (!unit) { unknown('Resolved callback has no measured runtime unit.'); continue; }
    const observed = stageFindings({ source, unit, node, spec: registration.spec });
    result.findings.push(...observed.findings);
    observed.reasons.forEach(unknown);
    result.stages.push({ callbackStart: unit.start, callbackEnd: unit.end, identity: unit.identity,
      choice: registration.spec.choice ?? null, registration: { path: parsed.path, line,
        start, end: call.getEnd(), method: registration.method } });
  }
}

function unique(items, key) {
  return [...new Map(items.map(item => [key(item), item])).values()];
}

export function stageAnalysis(parsed, measurement) {
  if (parsed.path !== measurement.path) throw new TypeError('Stage syntax and measurements must share one source path');
  const result = { findings: [], unverified: [], stages: [] };
  const units = new Map(measurement.functions.map(unit => [unit.start, unit]));
  const visit = node => {
    if (ts.isCallExpression(node)) recordRegistration({ call: node, registration: registrationFor(node),
      parsed, source: measurement, result, units });
    ts.forEachChild(node, visit);
  };
  visit(parsed.sourceFile);
  return { ...result, findings: unique(result.findings, item => `${item.rule}:${item.unitId}`),
    unverified: unique(result.unverified, item => `${item.line}:${item.reason}`) };
}
