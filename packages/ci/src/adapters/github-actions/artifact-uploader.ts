import { basename, dirname } from 'node:path';
import type { UploadArtifactOptions } from '../types';

type ArtifactModule = typeof import('@actions/artifact');

export async function uploadArtifact(
  artifact: ArtifactModule,
  opts: UploadArtifactOptions
): Promise<void> {
  const client = new artifact.DefaultArtifactClient();
  const root = dirname(opts.path);
  await client.uploadArtifact(
    opts.name,
    [opts.path],
    root,
    opts.retentionDays ? { retentionDays: opts.retentionDays } : {}
  );
  void basename; // keep import for future path manipulation
}
