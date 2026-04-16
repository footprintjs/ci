export interface ParsedChangelog {
  version: string | null;
  features: string[];
  fixes: string[];
  docs: string[];
  breaking: string[];
  other: string[];
  raw: string;
}

const SECTION_HEADERS: Array<{ key: keyof ParsedChangelog; match: RegExp }> = [
  { key: 'features', match: /^(###|##)\s*(✨\s*)?(features?|added|new)\b/i },
  { key: 'fixes', match: /^(###|##)\s*(🐛\s*)?(fixes?|fixed|bug\s*fixes)\b/i },
  { key: 'docs', match: /^(###|##)\s*(📚\s*)?(docs?|documentation)\b/i },
  { key: 'breaking', match: /^(###|##)\s*(💥\s*)?(breaking(\s*changes?)?|removed)\b/i },
];

/**
 * Parse a release body / CHANGELOG.md section into structured buckets.
 *
 * Accepts Keep-a-Changelog-style headings as well as common GitHub release
 * body variations. Unknown sections flow into `other`.
 */
export function parseChangelog(body: string): ParsedChangelog {
  const lines = body.split(/\r?\n/);
  const out: ParsedChangelog = {
    version: null,
    features: [],
    fixes: [],
    docs: [],
    breaking: [],
    other: [],
    raw: body,
  };

  let current: keyof ParsedChangelog | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const versionMatch = line.match(/^#\s*(?:\[)?(v?\d+\.\d+\.\d+[^\]\s]*)/i);
    if (versionMatch) {
      out.version = versionMatch[1] ?? null;
      continue;
    }

    const header = SECTION_HEADERS.find((h) => h.match.test(line));
    if (header) {
      current = header.key;
      continue;
    }
    if (/^(##|###)\s+/.test(line)) {
      current = 'other';
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      const text = (bulletMatch[1] ?? '').trim();
      if (!text) continue;
      if (!current || current === 'version' || current === 'raw') {
        out.other.push(text);
      } else {
        const bucket = out[current];
        if (Array.isArray(bucket)) {
          bucket.push(text);
        }
      }
    }
  }

  return out;
}
