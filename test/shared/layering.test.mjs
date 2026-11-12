// src/shared/ is imported by both release tools and imports neither; neither tool imports the
// other. This is what lets the hold check and the release route share one GET, one cleaner and
// one GitHub rule without one feature depending on the other.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((item) => item.isDirectory() ? walk(join(dir, item.name)) : [join(dir, item.name)]);
const imports = (path) => [...readFileSync(path, 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] ?? m[2]);
const code = (dir) => walk(dir).filter((path) => /\.(mjs|cjs)$/.test(path));

test('src/shared imports only node: modules and its own files', () => {
  for (const path of code('src/shared'))
    for (const target of imports(path)) assert.ok(target.startsWith('node:') || /^\.\/[a-z-]+\.mjs$/.test(target), `${path} imports ${target}`);
});

test('the hold check and the release route do not import each other', () => {
  for (const path of code('src/hold')) for (const target of imports(path)) assert.doesNotMatch(target, /release-route/, path);
  for (const path of code('src/release-route')) for (const target of imports(path)) assert.doesNotMatch(target, /\/hold\//, path);
  for (const path of [...code('src/hold'), ...code('src/release-route')])
    for (const target of imports(path)) assert.doesNotMatch(target, /guards|github-readonly/, path);
});
