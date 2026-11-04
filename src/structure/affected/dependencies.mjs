import { resolveExport } from './exports.mjs';

function noteInfo(path, state) {
  state.paths.add(path);
  const info = state.context.modules.get(path);
  if (info) {
    state.reader ||= info.reader;
    state.processLoader ||= info.processLoader;
    state.unverified.push(...info.unverified);
  }
  return info;
}

function requestUnknown(request, state) {
  state.unverified.push({ kind: 'affected-import', path: request.path, line: request.line, reason: request.reason });
}

function visitRequest(request, state) {
  if (request.reason) return requestUnknown(request, state);
  if (request.external) return;
  for (const name of request.names) {
    if (name === '*') visitWhole(request.target, state);
    else visitNamed(request.target, name, state);
  }
}

function effectPaths(path, state, seen = new Set()) {
  if (state.effects.has(path)) return state.effects.get(path);
  if (seen.has(path)) {
    state.unverified.push({ kind: 'affected-loading', path, line: 1, reason: 'Cyclic load-effect ownership remains conservative.' });
    return new Set([path]);
  }
  const info = state.context.modules.get(path);
  if (!info) return new Set([path]);
  const paths = new Set(info.effects ? [path] : []);
  const next = new Set(seen).add(path);
  for (const request of info.requests.filter(item => !item.dynamic)) {
    if (request.reason) { requestUnknown(request, state); paths.add(path); }
    if (!request.target) continue;
    const nested = effectPaths(request.target, state, next);
    if (nested.size) { paths.add(path); for (const child of nested) paths.add(child); }
  }
  state.effects.set(path, paths);
  return paths;
}

function visitOwner(path, state) {
  const key = `owner:${path}`;
  if (state.seen.has(key)) return;
  state.seen.add(key);
  const info = noteInfo(path, state);
  if (!info) return;
  for (const request of info.requests.filter(item => !item.reexport)) visitRequest(request, state);
  for (const loaded of effectPaths(path, state)) visitOwner(loaded, state);
}

function visitNamed(path, name, state) {
  const key = `named:${path}:${name}`;
  if (state.seen.has(key)) return;
  state.seen.add(key);
  const selected = resolveExport(state.context, path, name);
  state.unverified.push(...selected.unverified);
  for (const via of selected.via) {
    noteInfo(via, state);
    for (const loaded of effectPaths(via, state)) visitOwner(loaded, state);
  }
  for (const owner of selected.owners) {
    if (owner.name === '*') visitWhole(owner.path, state);
    else visitOwner(owner.path, state);
  }
  if (!selected.found || selected.unverified.length) {
    state.unverified.push({ kind: 'affected-export', path, line: 1, reason: 'Named owner is not uniquely proven; full module closure is retained.' });
    visitWhole(path, state);
  }
}

function visitWhole(path, state) {
  const key = `whole:${path}`;
  if (state.seen.has(key)) return;
  state.seen.add(key);
  const info = noteInfo(path, state);
  if (!info) return;
  for (const request of info.requests) visitRequest(request, state);
}

export function testDependencies(context, path) {
  const state = { context, paths: new Set(), seen: new Set(), effects: new Map(), reader: false, processLoader: false, unverified: [] };
  visitWhole(path, state);
  return { paths: state.paths, reader: state.reader, processLoader: state.processLoader, unverified: state.unverified };
}
