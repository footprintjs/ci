import { resolveRelative } from '../sources/paths.mjs';
import { moduleModel } from './module.mjs';

function uncertain(reason) { return { owners: [], reasons: [reason] }; }

function narrowed(result, entry) {
  return entry.typeOnly ? { ...result, owners: result.owners.map(owner => ({ ...owner, kinds: ['type'] })) } : result;
}

function combine(results) {
  const owners = [...new Map(results.flatMap(item => item.owners).map(owner =>
    [JSON.stringify([owner.unit?.path, owner.unit?.order, owner.external, owner.name, owner.kinds]), owner])).values()];
  const reasons = results.flatMap(item => item.reasons);
  if (owners.length > 1) reasons.push('Multiple declaration owners are unresolved.');
  return { owners, reasons };
}

export function forwarded(context, path, entry, seen) {
  let result;
  if (!entry.specifier?.startsWith('.')) result = { owners: [{ external: entry.specifier, name: entry.name,
    kinds: entry.typeOnly ? ['type'] : ['unknown'] }], reasons: ['External declaration kinds are unavailable.'] };
  else {
    const target = resolveRelative(path, entry.specifier, context.files);
    result = target.path ? exportedName(context, target.path, entry.name, seen) : uncertain(target.reason);
  }
  return narrowed(result, entry);
}

export function localName(context, path, name, seen = new Set()) {
  const model = moduleModel(context, path);
  if (model.locals.has(name)) return combine(model.locals.get(name).map(owner =>
    ({ owners: [owner], reasons: owner.kinds.length ? [] : ['Namespace declaration kinds are unresolved.'] })));
  if (model.imports.has(name)) return forwarded(context, path, model.imports.get(name), seen);
  return uncertain('Local exported binding has no declaration owner.');
}

export function exportedName(context, path, name, seen = new Set()) {
  const key = `${path}:${name}`;
  if (seen.has(key)) return uncertain('Cyclic export ownership is unresolved.');
  const next = new Set(seen).add(key);
  const model = moduleModel(context, path);
  if (model.opaque) return uncertain('Unsupported export or import-equals syntax remains unresolved.');
  const entries = model.exports.get(name);
  if (entries) return combine(entries.map(entry => narrowed(entry.direct ? { owners: [entry.direct], reasons: [] }
    : entry.specifier ? forwarded(context, path, entry, next) : localName(context, path, entry.name, next), entry)));
  if (name === 'default') return { owners: [], reasons: [] };
  return combine(model.stars.map(entry => forwarded(context, path, { ...entry, name }, next)));
}

export function exportedNames(context, path, seen = new Set()) {
  if (seen.has(path)) return { names: [], reasons: ['Cyclic export-star names are unresolved.'] };
  const model = moduleModel(context, path);
  const names = new Set(model.exports.keys());
  const reasons = model.opaque ? ['Unsupported export syntax remains unresolved.'] : [];
  for (const entry of model.stars) {
    const target = entry.specifier?.startsWith('.') ? resolveRelative(path, entry.specifier, context.files) : {};
    if (!target.path) { reasons.push('Export-star has no tracked source owner.'); continue; }
    const nested = exportedNames(context, target.path, new Set(seen).add(path));
    for (const name of nested.names) if (name !== 'default') names.add(name);
    reasons.push(...nested.reasons);
  }
  return { names: [...names].sort(), reasons };
}
