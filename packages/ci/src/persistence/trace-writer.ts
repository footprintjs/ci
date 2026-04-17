import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { TraceEnvelope } from './types.js';

const DEFAULT_DIR = './traces';
const DEFAULT_MAX_SIZE = 1024 * 1024; // 1 MB — per spec D.4

export interface TraceWriteResult {
  path: string;
  bytesWritten: number;
  truncated: boolean;
}

export async function writeTrace(
  envelope: TraceEnvelope,
  config: { dir?: string; maxSizeBytes?: number } | undefined
): Promise<TraceWriteResult> {
  const dir = resolve(config?.dir ?? DEFAULT_DIR);
  const maxSize = config?.maxSizeBytes ?? DEFAULT_MAX_SIZE;

  await mkdir(dir, { recursive: true });

  const ref = sanitize(envelope.trigger.ref ?? 'unknown');
  const ts = envelope.timestamp.replace(/[:.]/g, '-');
  const fileName = `${ref}-${ts}.json`;
  const finalPath = join(dir, fileName);
  const tempPath = `${finalPath}.${randomUUID()}.tmp`;

  let serialized = JSON.stringify(envelope, safeReplacer(), 2);
  let truncated = false;
  if (Buffer.byteLength(serialized, 'utf8') > maxSize) {
    truncated = true;
    const truncatedEnvelope: TraceEnvelope = {
      ...envelope,
      narrativeEntries: envelope.narrativeEntries.slice(0, 50),
      narrative: envelope.narrative.slice(0, 50),
      // Drop the snapshot — it's the largest and reconstructable from
      // narrativeEntries for most use cases.
      snapshot: null,
    };
    serialized = JSON.stringify(
      {
        ...truncatedEnvelope,
        _truncation: {
          note: 'Trace exceeded maxSizeBytes; snapshot dropped and narrative truncated',
          originalNarrativeCount: envelope.narrative.length,
          originalEntryCount: envelope.narrativeEntries.length,
          maxSizeBytes: maxSize,
        },
      },
      safeReplacer(),
      2
    );
  }

  await mkdir(dirname(tempPath), { recursive: true });
  await writeFile(tempPath, serialized, 'utf8');
  await rename(tempPath, finalPath);

  return {
    path: finalPath,
    bytesWritten: Buffer.byteLength(serialized, 'utf8'),
    truncated,
  };
}

function sanitize(s: string): string {
  return s.replace(/[^\w.\-]+/g, '_');
}

/**
 * Handle circular references (common in FootPrint snapshots — execution tree
 * can reference parent nodes) and drop non-serializable values (functions,
 * Maps, Sets).
 */
function safeReplacer() {
  const seen = new WeakSet<object>();
  return function (_key: string, value: unknown): unknown {
    if (typeof value === 'function') return undefined;
    if (value instanceof Map) return Object.fromEntries(value);
    if (value instanceof Set) return Array.from(value);
    if (value instanceof Error) {
      return { name: value.name, message: value.message, stack: value.stack };
    }
    if (value && typeof value === 'object') {
      if (seen.has(value as object)) return '[Circular]';
      seen.add(value as object);
    }
    return value;
  };
}
