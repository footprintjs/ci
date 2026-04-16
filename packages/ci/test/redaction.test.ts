import { describe, expect, it } from 'vitest';
import { presetRedactionPolicies, redact, REDACTED } from '../src/redaction';

describe('redaction', () => {
  it('redacts bearer tokens in strings', () => {
    const { value, report } = redact(
      { auth: 'Bearer abc123.def.xyz' },
      presetRedactionPolicies.apiKeys
    );
    expect((value as any).auth).not.toContain('abc123');
    expect((value as any).auth).toContain(REDACTED);
    expect(report.matchCount).toBeGreaterThan(0);
  });

  it('redacts values matching env var prefixes', () => {
    const env = {
      TWITTER_API_KEY: 'super-secret-key',
      FOO: 'bar',
    };
    const { value, report } = redact(
      { payload: 'my key is super-secret-key here' },
      presetRedactionPolicies.envVars(['TWITTER_']),
      env
    );
    expect((value as any).payload).not.toContain('super-secret-key');
    expect(report.envVarsFired).toContain('TWITTER_API_KEY');
  });

  it('leaves non-matching content unchanged', () => {
    const { value, report } = redact(
      { text: 'nothing secret here' },
      presetRedactionPolicies.apiKeys
    );
    expect(value).toEqual({ text: 'nothing secret here' });
    expect(report.matchCount).toBe(0);
  });

  it('combine() merges patterns + env prefixes', () => {
    const combined = presetRedactionPolicies.combine(
      presetRedactionPolicies.apiKeys,
      presetRedactionPolicies.envVars(['X_']),
    );
    expect(combined.patterns!.length).toBeGreaterThan(0);
    expect(combined.envVarPrefixes).toEqual(['X_']);
  });

  it('walks nested structures (arrays, objects)', () => {
    const input = {
      list: ['Bearer abcdef', 'ok'],
      nested: { key: 'api_key=xyz789' },
    };
    const { value } = redact(input, presetRedactionPolicies.apiKeys);
    const json = JSON.stringify(value);
    expect(json).not.toContain('abcdef');
    expect(json).not.toContain('xyz789');
  });
});
