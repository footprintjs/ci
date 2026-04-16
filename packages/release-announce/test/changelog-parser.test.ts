import { describe, expect, it } from 'vitest';
import { parseChangelog } from '../src/changelog-parser';

describe('parseChangelog', () => {
  it('parses a typical Keep-a-Changelog release body', () => {
    const body = `# v1.4.0

### ✨ Features
- add flow recorder
- support retries in fork stages

### 🐛 Fixes
- trace write race condition

### 📚 Docs
- expand README`;
    const r = parseChangelog(body);
    expect(r.version).toBe('v1.4.0');
    expect(r.features).toEqual([
      'add flow recorder',
      'support retries in fork stages',
    ]);
    expect(r.fixes).toEqual(['trace write race condition']);
    expect(r.docs).toEqual(['expand README']);
  });

  it('handles breaking changes section', () => {
    const body = `## Breaking Changes
- rename adapter interface

## Features
- add github-actions adapter`;
    const r = parseChangelog(body);
    expect(r.breaking).toEqual(['rename adapter interface']);
    expect(r.features).toEqual(['add github-actions adapter']);
  });

  it('treats unknown sections as "other"', () => {
    const body = `## What's Next
- launch on ProductHunt`;
    const r = parseChangelog(body);
    expect(r.other).toEqual(['launch on ProductHunt']);
  });

  it('returns empty buckets for empty input', () => {
    const r = parseChangelog('');
    expect(r.version).toBeNull();
    expect(r.features).toEqual([]);
    expect(r.fixes).toEqual([]);
  });

  it('ignores non-bullet lines', () => {
    const body = `### Features
This is prose, not a bullet.
- but this is`;
    const r = parseChangelog(body);
    expect(r.features).toEqual(['but this is']);
  });

  it('handles multiple sections of the same type', () => {
    const body = `### Features
- first

### Fixes
- fix one

### Features
- second`;
    const r = parseChangelog(body);
    expect(r.features).toEqual(['first', 'second']);
    expect(r.fixes).toEqual(['fix one']);
  });
});
