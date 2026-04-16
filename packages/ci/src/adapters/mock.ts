import type {
  CIAdapter,
  CommitToRepoOptions,
  LogLevel,
  Trigger,
  UploadArtifactOptions,
} from './types';

export interface MockAdapterOptions {
  trigger?: Partial<Trigger>;
  secrets?: Record<string, string>;
  /** If set, `readTrigger` rejects with this error. */
  triggerError?: Error;
  /** If set, `uploadArtifact` rejects with this error. */
  uploadError?: Error;
  /** If set, `commitToRepo` rejects with this error. */
  commitError?: Error;
}

export interface MockAdapterCalls {
  uploadArtifact: UploadArtifactOptions[];
  commitToRepo: CommitToRepoOptions[];
  outputs: Array<{ key: string; value: string }>;
  logs: Array<{ level: LogLevel; msg: string; meta?: Record<string, unknown> }>;
  initialized: number;
  finalized: Array<'success' | 'failure'>;
}

/**
 * Test-only adapter. Records every call for assertions; configurable to
 * simulate errors from any operation.
 */
export class MockAdapter implements CIAdapter {
  readonly name = 'mock';
  readonly calls: MockAdapterCalls = {
    uploadArtifact: [],
    commitToRepo: [],
    outputs: [],
    logs: [],
    initialized: 0,
    finalized: [],
  };

  constructor(private readonly opts: MockAdapterOptions = {}) {}

  async initialize(): Promise<void> {
    this.calls.initialized++;
  }

  async readTrigger(): Promise<Trigger> {
    if (this.opts.triggerError) throw this.opts.triggerError;
    return {
      event: 'release.published',
      ref: 'v1.0.0',
      sha: 'mocksha',
      actor: 'mockuser',
      ...this.opts.trigger,
    };
  }

  readSecrets<K extends string>(
    keys: readonly K[]
  ): Record<K, string | undefined> {
    const secrets = this.opts.secrets ?? {};
    const out = {} as Record<K, string | undefined>;
    for (const k of keys) out[k] = secrets[k];
    return out;
  }

  async uploadArtifact(opts: UploadArtifactOptions): Promise<void> {
    if (this.opts.uploadError) throw this.opts.uploadError;
    this.calls.uploadArtifact.push(opts);
  }

  async commitToRepo(opts: CommitToRepoOptions): Promise<void> {
    if (this.opts.commitError) throw this.opts.commitError;
    this.calls.commitToRepo.push(opts);
  }

  async setOutput(key: string, value: string): Promise<void> {
    this.calls.outputs.push({ key, value });
  }

  log(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
    this.calls.logs.push({ level, msg, meta });
  }

  async finalize(result: 'success' | 'failure'): Promise<void> {
    this.calls.finalized.push(result);
  }
}
