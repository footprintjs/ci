export function checkedObjectId(value, width = null) {
  if (typeof value !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value)
    || (width !== null && value.length !== width)) throw new TypeError('Invalid or inconsistent Git object id.');
  return value;
}

export function checkedPath(value) {
  if (typeof value !== 'string' || !value.isWellFormed() || !value || value.includes('\0')
    || value.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new TypeError('Invalid canonical Git path.');
  }
  return value;
}

export function checkedRaw(value) {
  if (!value || !Number.isInteger(value.exitCode) || typeof value.stdout !== 'string'
    || typeof value.stderr !== 'string' || !value.stdout.isWellFormed() || !value.stderr.isWellFormed()) {
    throw new TypeError('Invalid raw Git process observation.');
  }
  return value;
}
