import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { TraceEnvelope, TraceStorageConfig } from './types';

const DEFAULT_DIR = './traces';
const DEFAULT_MAX_SIZE = 1024 * 1024; // 1 MB per spec D.4

export interface TraceWriteResult {
  path: string;
  bytesWritten: number;
  truncated: boolean;
}

export async function writeTrace(
  envelope: TraceEnvelope,
  config: TraceStorageConfig | undefined
): Promise<TraceWriteResult> {
  const dir = resolve(config?.dir ?? DEFAULT_DIR);
  const maxSize = config?.maxSizeBytes ?? DEFAULT_MAX_SIZE;

  await mkdir(dir, { recursive: true });

  const ref = sanitize(envelope.trigger.ref ?? 'unknown');
  const ts = envelope.timestamp.replace(/[:.]/g, '-');
  const fileName = `${ref}-${ts}.json`;
  const finalPath = join(dir, fileName);
  const tempPath = `${finalPath}.${randomUUID()}.tmp`;

  let serialized = JSON.stringify(envelope, null, 2);
  let truncated = false;
  if (Buffer.byteLength(serialized, 'utf8') > maxSize) {
    truncated = true;
    const truncatedEnvelope: TraceEnvelope = {
      ...envelope,
      stages: envelope.stages.slice(0, 20),
      forks: envelope.forks.slice(0, 5),
    };
    serialized = JSON.stringify(
      {
        ...truncatedEnvelope,
        _truncation: {
          note: 'Trace exceeded maxSizeBytes; stages and forks truncated',
          originalStageCount: envelope.stages.length,
          originalForkCount: envelope.forks.length,
          maxSizeBytes: maxSize,
        },
      },
      null,
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
