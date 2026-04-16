export interface RedactionPolicy {
  /** Regex patterns applied to all string values in traces. */
  patterns?: RegExp[];
  /**
   * Environment variable prefixes. Any env var whose name starts with one of
   * these prefixes has its value redacted when encountered in trace output.
   */
  envVarPrefixes?: string[];
  /** Replacement string. Defaults to `'***REDACTED***'`. */
  replacement?: string;
}

export const REDACTED = '***REDACTED***';

/**
 * Preset redaction policies covering common secret patterns.
 */
export const presetRedactionPolicies = {
  apiKeys: {
    patterns: [
      /Bearer\s+[\w\-.~+/]+=*/gi,
      /api[_-]?key["\s:=]+["']?[\w\-]+/gi,
      /access[_-]?token["\s:=]+["']?[\w\-]+/gi,
      /secret[_-]?key["\s:=]+["']?[\w\-]+/gi,
    ],
  } satisfies RedactionPolicy,

  envVars(prefixes: string[]): RedactionPolicy {
    return { envVarPrefixes: prefixes };
  },

  combine(...policies: RedactionPolicy[]): RedactionPolicy {
    return {
      patterns: policies.flatMap((p) => p.patterns ?? []),
      envVarPrefixes: policies.flatMap((p) => p.envVarPrefixes ?? []),
      replacement: policies.find((p) => p.replacement)?.replacement,
    };
  },
};

export interface RedactionReport {
  matchCount: number;
  patternsFired: string[];
  envVarsFired: string[];
}

/**
 * Deep-redact any string values in `value`. Returns a redacted copy plus a
 * report describing what was matched.
 */
export function redact(
  value: unknown,
  policy: RedactionPolicy | undefined,
  env: Record<string, string | undefined> = process.env
): { value: unknown; report: RedactionReport } {
  const replacement = policy?.replacement ?? REDACTED;
  const patterns = policy?.patterns ?? [];
  const prefixes = policy?.envVarPrefixes ?? [];

  const secretValues = new Set<string>();
  if (prefixes.length > 0) {
    for (const [key, val] of Object.entries(env)) {
      if (!val) continue;
      if (prefixes.some((p) => key.startsWith(p))) {
        secretValues.add(val);
      }
    }
  }

  const patternsFired = new Set<string>();
  const envVarsFired = new Set<string>();
  let matchCount = 0;

  const redactString = (s: string): string => {
    let result = s;
    for (const [key, val] of Object.entries(env)) {
      if (val && secretValues.has(val) && result.includes(val)) {
        result = result.split(val).join(replacement);
        envVarsFired.add(key);
        matchCount++;
      }
    }
    for (const pat of patterns) {
      // Reset regex state; patterns may use /g flag.
      pat.lastIndex = 0;
      if (pat.test(result)) {
        patternsFired.add(pat.source);
        const matches = result.match(new RegExp(pat.source, pat.flags));
        matchCount += matches?.length ?? 1;
        result = result.replace(new RegExp(pat.source, pat.flags), replacement);
      }
    }
    return result;
  };

  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return redactString(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        out[k] = walk(val);
      }
      return out;
    }
    return v;
  };

  return {
    value: walk(value),
    report: {
      matchCount,
      patternsFired: [...patternsFired],
      envVarsFired: [...envVarsFired],
    },
  };
}
