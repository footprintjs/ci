import type { CIAdapter } from '../types.js';
import {
  GitHubActionsAdapter,
  type GitHubActionsAdapterOptions,
} from './adapter.js';

export type { GitHubActionsAdapterOptions };

/**
 * Build a GitHub Actions adapter. Loads optional peer dependencies
 * (`@actions/core`, `@actions/artifact`, `simple-git`) at call time — if any
 * are missing, throws an actionable error telling the user how to install
 * them.
 */
export async function githubActions(
  opts?: GitHubActionsAdapterOptions
): Promise<CIAdapter> {
  let core: typeof import('@actions/core');
  let artifact: typeof import('@actions/artifact');
  let simpleGit: typeof import('simple-git');

  try {
    [core, artifact, simpleGit] = await Promise.all([
      import('@actions/core'),
      import('@actions/artifact'),
      import('simple-git'),
    ]);
  } catch (err) {
    throw new Error(
      [
        'GitHub Actions adapter requires optional peer dependencies.',
        'Install them with:',
        '  npm install --save-dev @actions/core @actions/artifact simple-git',
        '',
        `Original error: ${(err as Error).message}`,
      ].join('\n')
    );
  }

  return new GitHubActionsAdapter(
    { core, artifact, simpleGit },
    opts ?? {}
  );
}
