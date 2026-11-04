import { parseSource } from './parse.mjs';

/** Reuse only immutable syntax for an exact path/text pair within one comparison. */
export function parseFiles(entries, previous = null) {
  return new Map([...entries].map(([path, file]) => {
    const existing = previous?.get(path);
    return [path, existing?.text === file.text ? existing : parseSource(file)];
  }));
}
