// Real CHANGELOG heads of four packages (the first 40 lines at the heads the design read) and
// the two styles' edges.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { decodeChangelog, findSection, MAX_CHANGELOG_BYTES } from '../../src/release-route/changelog.mjs';
import { asRefusal } from '../../src/release-route/refusals.mjs';

const real = (name) => decodeChangelog(readFileSync(new URL(`fixtures/changelog/${name}.md`, import.meta.url)));
const DASH = '\u{2014}';
const code = (fn) => {
  try { fn(); } catch (error) { return asRefusal(error).code; }
  return 'no refusal';
};

test('titled: storydeck 0.13.1 and storyreel 0.29.1, title and first bullet', () => {
  const deck = findSection(real('storydeck'), '0.13.1', 'titled');
  assert.equal(deck.title, 'works beside footprintjs 12');
  assert.match(deck.lines[0], /^- \*\*The PowerPoint export works beside footprintjs 12\.\*\*/);
  assert.equal(deck.lines.at(-1).trim().length > 0, true);
  const reel = findSection(real('storyreel'), '0.29.1', 'titled');
  assert.equal(reel.title, 'one engine beside footprintjs 12');
  assert.equal(findSection(real('storydeck'), '0.13.0', 'titled').title, `narrate: one command for a deck's voice`);
});

test('keepachangelog: hcifootprint 4.1.0 and lens 0.81.0, no title, the ### parts kept', () => {
  const hci = findSection(real('hcifootprint'), '4.1.0', 'keepachangelog');
  assert.equal(hci.title, '');
  assert.equal(hci.lines[0], '### Added');
  assert.ok(!hci.lines.some((line) => line.startsWith('## ')));
  const lens = findSection(real('agentfootprint-lens'), '0.81.0', 'keepachangelog');
  assert.deepEqual(lens.lines.slice(0, 2), ['### Fixed', '']);
});

test('a version with no section is null, in either style; the other style does not match', () => {
  assert.equal(findSection(real('storydeck'), '0.13.2', 'titled'), null);
  assert.equal(findSection(real('hcifootprint'), '9.9.9', 'keepachangelog'), null);
  assert.equal(findSection(real('storydeck'), '0.13.1', 'keepachangelog'), null);
  assert.equal(findSection(real('hcifootprint'), '4.1.0', 'titled'), null);
  assert.equal(findSection('## [Unreleased]\n\n- x\n', '1.0.0', 'keepachangelog'), null);
});

test('the version must match exactly, not as a prefix or inside text', () => {
  const text = `## 1.0.10 ${DASH} ten\n- a\n## 1.0.1x\n- b\n## 11.0.1 ${DASH} eleven\n- c\n`;
  assert.equal(findSection(text, '1.0.1', 'titled'), null);
  assert.equal(findSection(text, '1.0.10', 'titled').title, 'ten');
});

test('a keepachangelog heading may carry a title; link definitions at the end are dropped', () => {
  const text = `## [2.0.0] - 2026-11-12 ${DASH} the big one\n\n### Changed\n\n- x\n\n[2.0.0]: https://example.invalid/compare\n`;
  assert.deepEqual(findSection(text, '2.0.0', 'keepachangelog'), { title: 'the big one', lines: ['### Changed', '', '- x'] });
});

test('a "## " inside a fenced code block is not a heading', () => {
  const text = `## 1.0.0 ${DASH} t\n- before\n\`\`\`md\n## 0.9.0 ${DASH} not a heading\n\`\`\`\n- after\n## 0.9.0 ${DASH} real\n- old\n`;
  const section = findSection(text, '1.0.0', 'titled');
  assert.ok(section.lines.includes('- after'));
  assert.equal(findSection(text, '0.9.0', 'titled').title, 'real');
});

test('two sections for one version is changelog-duplicate', () => {
  assert.equal(code(() => findSection(`## 1.0.0 ${DASH} a\n- x\n## 1.0.0 ${DASH} b\n- y\n`, '1.0.0', 'titled')), 'changelog-duplicate');
});

test('title and lines lose control and bidi characters and are bounded', () => {
  const text = `## 1.0.0 ${DASH} evil\u{202E}title ${'x'.repeat(200)}\n- line\u{0007}one\n`;
  const section = findSection(text, '1.0.0', 'titled');
  assert.ok(section.title.startsWith('eviltitle '));
  assert.ok(Array.from(section.title).length <= 123);
  assert.equal(section.lines[0], '- line one');
});

test('the bytes must be strict UTF-8 within the bound; an unknown style is a settings refusal', () => {
  assert.equal(code(() => decodeChangelog(Buffer.from([0x23, 0xff]))), 'changelog-unreadable');
  assert.equal(code(() => decodeChangelog(Buffer.alloc(MAX_CHANGELOG_BYTES + 1, 0x20))), 'changelog-unreadable');
  assert.equal(code(() => decodeChangelog('text')), 'changelog-unreadable');
  assert.equal(code(() => findSection('', '1.0.0', 'toString')), 'settings-invalid');
});
