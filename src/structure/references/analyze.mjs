import { overLimit } from '../rules/finding.mjs';
import { referenceTextPath } from '../sources/text-formats.mjs';
import { sourceComments } from './comments.mjs';
import { declarationOwners, symbolOwner } from './owners.mjs';
import { extractReferences, historicalPath, referenceTarget } from './citations.mjs';
import { readerReferences } from './readers.mjs';

function finding(file, reference, rule) {
  return overLimit({ path: file.path }, { kind: 'reference', start: reference.offset,
    line: file.text.slice(0, reference.offset).split('\n').length, name: reference.symbol ?? reference.target,
    identity: `${rule}:${reference.target}:${reference.symbol ?? ''}` }, { rule, value: 1, limit: 0 });
}

function inspectReference(file, reference, context) {
  const target = referenceTarget(reference, file.path, context.files);
  if (target.unverified || (reference.symbol && target.paths.length > 1)) {
    return { findings: [], unverified: [{ kind: 'citation-owner', path: file.path,
      target: reference.target, reason: target.unverified ?? 'Citation does not identify one tracked declaration file.' }] };
  }
  if (!target.paths.length) return { findings: finding(file, reference, 'stale-path'), unverified: [] };
  if (!reference.symbol) return { findings: [], unverified: [] };
  const path = target.paths[0];
  if (!context.owners.has(path)) context.owners.set(path,
    context.parsed.has(path) ? declarationOwners(context.parsed.get(path)) : undefined);
  const owners = context.owners.get(path);
  const ownership = symbolOwner(owners, reference.symbol);
  if (ownership === 'present') return { findings: [], unverified: [] };
  if (ownership === 'unverified') return { findings: [], unverified: [{ kind: 'citation-owner',
    path: file.path, target: reference.target, reason: 'Declaration name is ambiguous or computed.' }] };
  return { findings: finding(file, reference, 'citation-owner'), unverified: [] };
}

function fileReferences(file, parsed) {
  if (referenceTextPath(file.path)) {
    return { references: extractReferences(file.text), unverified: [] };
  }
  if (!parsed) return { references: [], unverified: [] };
  const comments = sourceComments(parsed).flatMap(comment => extractReferences(comment.text, comment.offset));
  return { references: comments, unverified: [] };
}

function analyzeFiles(files, parsedFiles, observe) {
  const findings = [];
  const unverified = [];
  const historicalReferences = [];
  const owners = new Map();
  for (const [path, file] of files) {
    const observed = observe(file, parsedFiles.get(path));
    unverified.push(...observed.unverified);
    for (const reference of observed.references) {
      if (historicalPath(path)) historicalReferences.push({ path, ...reference });
      else {
        const result = inspectReference(file, reference, { files, owners, parsed: parsedFiles });
        findings.push(...result.findings);
        unverified.push(...result.unverified);
      }
    }
  }
  return { findings, unverified, historicalReferences };
}

export function referenceAnalysis(files, parsedFiles) {
  return analyzeFiles(files, parsedFiles, fileReferences);
}

/** Only explicit diff candidates get reader analysis; documents/comments are a separate pass. */
export function sourceReaderAnalysis(files, parsedFiles, paths) {
  const selected = new Set(paths);
  return analyzeFiles(files, parsedFiles, (file, parsed) => parsed && selected.has(file.path)
    ? readerReferences(parsed) : { references: [], unverified: [] });
}
