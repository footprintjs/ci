import { checkedRaw } from './grammar.mjs';

export function parseVersion(observed) {
  const value = checkedRaw(observed);
  const match = /^git version (\d+)\.(\d+)\.(\d+)([^\r\n\0]*)(?:\r?\n)?$/.exec(value.stdout);
  if (value.exitCode !== 0 || !match) throw new Error('Cannot identify the observed Git version.');
  const [major, minor] = match.slice(1, 3).map(Number);
  if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minor) || major < 2 || (major === 2 && minor < 38)) {
    throw new Error('Merge replay requires Git 2.38 or newer.');
  }
  return value.stdout.replace(/\r?\n$/, '');
}
