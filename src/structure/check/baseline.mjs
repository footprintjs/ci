import { discoverDoors } from '../sources/doors.mjs';
import { facadeAnalysis } from '../facades/index.mjs';

/** Role changes are compared under one head shape, rather than inventing new old debt. */
export function headShapedBaseline(headContext, baseContext, report) {
  const doors = discoverDoors(headContext.files, headContext.parsed);
  const oldDoors = discoverDoors(baseContext.files, baseContext.parsed);
  const measurements = new Map(report.measurements.map(item => [item.path, item]));
  const findings = [...report.findings];
  const extra = [];
  for (const path of doors.paths) {
    if (oldDoors.paths.has(path)) continue;
    if (!baseContext.parsed.has(path) || !measurements.has(path)) continue;
    const observed = facadeAnalysis(baseContext.parsed.get(path), measurements.get(path));
    findings.push(...observed.findings);
    extra.push(...observed.unverified.map(item => ({ ...item, scope: 'head-shaped-base-facade' })));
  }
  const unverified = [...report.coverage.unverified, ...extra];
  return { ...report, findings, coverage: { complete: unverified.length === 0, unverified } };
}
