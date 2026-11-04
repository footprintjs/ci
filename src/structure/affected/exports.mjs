const unknown = (path, reason) => ({ kind: 'affected-export', path, line: 1, reason });

function result(path, owners = [], unverified = [], found = true) {
  return { found, owners, via: [path], unverified };
}

function forwarded(request, context, seen) {
  if (request.reason) return result(request.path, [], [unknown(request.path, request.reason)]);
  if (request.external) return result(request.path);
  if (request.names[0] === '*') return result(request.path, [{ path: request.target, name: '*' }]);
  return resolveExport(context, request.target, request.names[0], seen);
}

function entryOwner(entry, path, context, seen) {
  const info = context.modules.get(path);
  if (entry.request) return forwarded(entry.request, context, seen);
  if (entry.owner || info.locals.has(entry.local)) return result(path, [{ path, name: entry.owner || entry.local }]);
  if (info.imports.has(entry.local)) return forwarded(info.imports.get(entry.local), context, seen);
  return result(path, [], [unknown(path, 'Local export has no admitted declaration or import owner.')]);
}

function combined(path, choices) {
  const owners = [...new Map(choices.flatMap(item => item.owners).map(owner => [JSON.stringify(owner), owner])).values()];
  const unverified = choices.flatMap(item => item.unverified);
  if (owners.length > 1) unverified.push(unknown(path, 'Multiple export-star owners remain possible.'));
  return { found: choices.some(item => item.found), owners,
    via: [...new Set([path, ...choices.filter(item => item.found || item.unverified.length).flatMap(item => item.via)])], unverified };
}

/** Resolve named runtime declarations through finite local aliases and reexports. */
export function resolveExport(context, path, name, seen = new Set()) {
  const key = `${path}\0${name}`;
  if (seen.has(key)) return result(path, [], [unknown(path, 'Cyclic export ownership remains unresolved.')]);
  if (!context.modules.has(path)) return result(path, [{ path, name: '*' }]);
  const next = new Set(seen).add(key);
  const info = context.modules.get(path);
  const entries = info.exports.get(name) ?? [];
  if (entries.length) {
    const selected = combined(path, entries.map(entry => entryOwner(entry, path, context, next)));
    if (entries.length > 1) selected.unverified.push(unknown(path, 'Duplicate explicit export ownership is unresolved.'));
    return selected;
  }
  const choices = name === 'default' ? [] : info.stars.map(request => forwarded({ ...request, names: [name] }, context, next));
  if (choices.length) return combined(path, choices);
  return result(path, [], [], false);
}
