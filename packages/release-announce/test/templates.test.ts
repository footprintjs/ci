import { describe, expect, it } from 'vitest';
import { renderTemplate, truncate } from '../src/templates';
import { parseChangelog } from '../src/changelog-parser';

const sample = parseChangelog(`### Features
- add thing

### Fixes
- fix bug`);

describe('renderTemplate', () => {
  it('default template includes version + highlights', () => {
    const out = renderTemplate('default', {
      version: 'v1.2.0',
      changelog: sample,
      repoUrl: 'https://github.com/foo/bar',
    });
    expect(out.text).toContain('v1.2.0');
    expect(out.text).toContain('add thing');
    expect(out.text).toContain('fix bug');
    expect(out.text).toContain('https://github.com/foo/bar');
  });

  it('minimal template is short and single-line-ish', () => {
    const out = renderTemplate('minimal', {
      version: 'v1.2.0',
      changelog: sample,
      repoUrl: 'https://x.io/y',
    });
    expect(out.text.split('\n').length).toBe(1);
    expect(out.text).toContain('v1.2.0');
    expect(out.text).toContain('https://x.io/y');
  });

  it('long-form template emits markdown with sections', () => {
    const out = renderTemplate('long-form', {
      version: 'v2.0.0',
      changelog: parseChangelog(
        `### Features
- a

### Fixes
- b

### Breaking Changes
- c`
      ),
    });
    expect(out.markdown).toContain('## ✨ Features');
    expect(out.markdown).toContain('## 🐛 Fixes');
    expect(out.markdown).toContain('## 💥 Breaking changes');
  });

  it('respects custom emoji prefix', () => {
    const out = renderTemplate('default', {
      version: 'v1.0.1',
      changelog: sample,
      emojiPrefix: '🎉',
    });
    expect(out.text.startsWith('🎉 ')).toBe(true);
  });
});

describe('truncate', () => {
  it('passes through when under the limit', () => {
    expect(truncate('short', 10)).toBe('short');
  });

  it('adds ellipsis when over the limit', () => {
    const out = truncate('12345678901234567890', 10);
    expect(out.length).toBe(10);
    expect(out.endsWith('…')).toBe(true);
  });
});
