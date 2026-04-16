import type {
  CIAdapter,
  CommitToRepoOptions,
  LogLevel,
  Trigger,
  UploadArtifactOptions,
} from '../types';
import { parseEvent } from './event-parser';
import { logToGhActions } from './annotations';
import { uploadArtifact } from './artifact-uploader';
import { commitFile } from './git-commit';

type CoreModule = typeof import('@actions/core');
type ArtifactModule = typeof import('@actions/artifact');
type SimpleGitModule = typeof import('simple-git');

export interface GitHubActionsAdapterDeps {
  core: CoreModule;
  artifact: ArtifactModule;
  simpleGit: SimpleGitModule;
}

export interface GitHubActionsAdapterOptions {
  /** Override the committer name used for `commitToRepo`. */
  actor?: string;
}

export class GitHubActionsAdapter implements CIAdapter {
  readonly name = 'github-actions';

  private readonly core: CoreModule;
  private readonly artifact: ArtifactModule;
  private readonly simpleGit: SimpleGitModule;
  private readonly options: GitHubActionsAdapterOptions;

  constructor(
    deps: GitHubActionsAdapterDeps,
    options: GitHubActionsAdapterOptions = {}
  ) {
    this.core = deps.core;
    this.artifact = deps.artifact;
    this.simpleGit = deps.simpleGit;
    this.options = options;
  }

  async readTrigger(): Promise<Trigger> {
    return parseEvent({
      eventName: process.env['GITHUB_EVENT_NAME'] ?? 'manual',
      eventPath: process.env['GITHUB_EVENT_PATH'],
      sha: process.env['GITHUB_SHA'],
      actor: process.env['GITHUB_ACTOR'],
      ref: process.env['GITHUB_REF'],
    });
  }

  readSecrets<K extends string>(
    keys: readonly K[]
  ): Record<K, string | undefined> {
    const out = {} as Record<K, string | undefined>;
    for (const k of keys) out[k] = process.env[k];
    return out;
  }

  async uploadArtifact(opts: UploadArtifactOptions): Promise<void> {
    try {
      await uploadArtifact(this.artifact, opts);
    } catch (err) {
      this.log('warn', `uploadArtifact failed: ${(err as Error).message}`);
    }
  }

  async commitToRepo(opts: CommitToRepoOptions): Promise<void> {
    try {
      await commitFile(this.simpleGit, {
        ...opts,
        actor: this.options.actor,
        token: process.env['GITHUB_TOKEN'],
        repository: process.env['GITHUB_REPOSITORY'],
      });
    } catch (err) {
      this.log('warn', `commitToRepo failed: ${(err as Error).message}`);
    }
  }

  async setOutput(key: string, value: string): Promise<void> {
    this.core.setOutput(key, value);
  }

  log(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
    logToGhActions(this.core, level, msg, meta);
  }
}
