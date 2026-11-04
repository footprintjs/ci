import ts from 'typescript';
import { createHash } from 'node:crypto';
import { trackedFiles, codePath, measurementPath } from '../sources/paths.mjs';
import { discoverDoors } from '../sources/doors.mjs';
import { parseSource } from '../syntax/parse.mjs';
import { measureParsed } from '../metrics/measure.mjs';
import { evaluateMeasurements } from '../rules/index.mjs';
import { facadeAnalysis } from '../facades/index.mjs';
import { stageAnalysis } from '../stages/index.mjs';
import { graphAnalysis } from '../graph/index.mjs';
import { referenceAnalysis } from '../references/index.mjs';

function sourceUnits(parsed) {
  return new Map([...parsed].filter(([path]) => measurementPath(path))
    .map(([path, source]) => [path, measureParsed(source)]));
}

function syntaxCoverage(parsed) {
  return [...parsed].flatMap(([path, source]) => source.sourceFile.parseDiagnostics.map(item => ({
    kind: 'parse-error', path, code: item.code,
    line: source.sourceFile.getLineAndCharacterOfPosition(item.start ?? 0).line + 1,
    reason: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
  })));
}

function unitRules(parsed, measurements, doors) {
  const findings = [];
  const unverified = [];
  const stages = [];
  for (const [path, measurement] of measurements) {
    findings.push(...evaluateMeasurements(measurement));
    if (doors.paths.has(path)) {
      const facade = facadeAnalysis(parsed.get(path), measurement);
      findings.push(...facade.findings);
      unverified.push(...facade.unverified);
    }
    const stage = stageAnalysis(parsed.get(path), measurement);
    findings.push(...stage.findings);
    unverified.push(...stage.unverified);
    stages.push(...stage.stages);
  }
  return { findings, unverified, stages };
}

function wholeFileHashes(findings, files) {
  return findings.map(item => item.kind === 'file' ? { ...item,
    bodyHash: createHash('sha256').update(files.get(item.path).text).digest('hex') } : item);
}

/** Internal context lets diff consumers reuse parsed trees without publishing ASTs. */
export function observeSnapshotContext(snapshot) {
  const files = trackedFiles(snapshot);
  const parsed = new Map([...files].filter(([path]) => codePath(path)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([path, source]) => [path, parseSource(source)]));
  const measurements = sourceUnits(parsed);
  const doors = discoverDoors(files);
  const units = unitRules(parsed, measurements, doors);
  const graph = graphAnalysis(files, parsed, doors);
  const references = referenceAnalysis(files, parsed);
  const unverified = [...syntaxCoverage(parsed), ...doors.unverified, ...units.unverified,
    ...graph.unverified, ...references.unverified];
  const report = { id: snapshot.id ?? null, findings: wholeFileHashes([
    ...units.findings, ...graph.findings, ...references.findings], files),
  coverage: { complete: unverified.length === 0, unverified },
  historicalReferences: references.historicalReferences, loads: graph.loads,
  sourceReaders: { unverifiedCount: references.unverified.filter(item => item.kind === 'source-reader').length },
  stages: units.stages, mutualSiblingPairs: graph.mutualSiblingPairs,
  measurements: [...measurements.values()], graph: { edges: graph.edges } };
  return { files, parsed, report };
}

export function observeSnapshot(snapshot) {
  return observeSnapshotContext(snapshot).report;
}
