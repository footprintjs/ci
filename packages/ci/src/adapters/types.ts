/**
 * Adapter contract. This is the single most important interface in the
 * library — keep it stable.
 *
 * Contract rules for adapter implementations:
 * - Pure wrapper — no business logic.
 * - MUST NOT call FootPrint directly.
 * - MUST handle missing capabilities gracefully (no-op return, don't throw).
 * - MUST NOT throw on `readSecrets` for missing keys — return `undefined`.
 */

export type TriggerEvent =
  | 'release.published'
  | 'push'
  | 'pull_request'
  | 'schedule'
  | 'manual';

export interface Trigger {
  event: TriggerEvent;
  ref?: string;
  sha?: string;
  actor?: string;
  payload?: Record<string, unknown>;
}

export interface UploadArtifactOptions {
  path: string;
  name: string;
  retentionDays?: number;
}

export interface CommitToRepoOptions {
  path: string;
  message: string;
  branch?: string;
}

export type LogLevel = 'info' | 'warn' | 'error';

export interface CIAdapter {
  readonly name: string;

  readTrigger(): Promise<Trigger>;

  readSecrets<K extends string>(
    keys: readonly K[]
  ): Record<K, string | undefined>;

  uploadArtifact(opts: UploadArtifactOptions): Promise<void>;

  commitToRepo(opts: CommitToRepoOptions): Promise<void>;

  setOutput?(key: string, value: string): Promise<void>;

  log(level: LogLevel, msg: string, meta?: Record<string, unknown>): void;

  initialize?(): Promise<void>;
  finalize?(result: 'success' | 'failure'): Promise<void>;
}
