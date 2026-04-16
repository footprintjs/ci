import { relative, resolve } from 'node:path';
import type { CommitToRepoOptions } from '../types';

type SimpleGitModule = typeof import('simple-git');

export interface CommitOptions extends CommitToRepoOptions {
  actor?: string;
  token?: string;
  remote?: string;
  repository?: string;
}

export async function commitFile(
  simpleGitMod: SimpleGitModule,
  opts: CommitOptions
): Promise<void> {
  const git = simpleGitMod.simpleGit();

  const userEmail = opts.actor
    ? `${opts.actor}@users.noreply.github.com`
    : 'github-actions[bot]@users.noreply.github.com';
  const userName = opts.actor ?? 'github-actions[bot]';

  await git.addConfig('user.email', userEmail);
  await git.addConfig('user.name', userName);

  const repoRoot = resolve(await git.revparse(['--show-toplevel']));
  const filePath = relative(repoRoot, resolve(opts.path));

  if (opts.branch) {
    try {
      await git.checkout(opts.branch);
    } catch {
      await git.checkoutLocalBranch(opts.branch);
    }
  }

  await git.add(filePath);

  const status = await git.status();
  if (status.staged.length === 0) {
    return; // nothing to commit
  }

  await git.commit(opts.message);

  if (opts.token && opts.repository) {
    const url = `https://x-access-token:${opts.token}@github.com/${opts.repository}.git`;
    await git.push(url, opts.branch ?? 'HEAD');
  } else {
    await git.push('origin', opts.branch ?? 'HEAD').catch(() => {
      // Push is best-effort; in detached HEAD or missing remote this is a no-op.
    });
  }
}
