/** Deliberately finite glob grammar; unsupported syntax is not an exclusion proof. */
export function literalGlob(pattern) {
  while (pattern.startsWith('./')) pattern = pattern.slice(2);
  if (!pattern || pattern.startsWith('/') || pattern.includes('..') || /[!{}[\]()\\]/.test(pattern)) return null;
  let expression = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '*' && pattern[index + 1] === '*') {
      index += 1;
      if (pattern[index + 1] === '/') { expression += '(?:.*/)?'; index += 1; }
      else expression += '.*';
    } else if (char === '*') expression += '[^/]*';
    else if (char === '?') expression += '[^/]';
    else expression += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`${expression}$`);
}
