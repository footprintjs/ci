// Download what npm serves (registry.mjs · downloadTarball) and take its integrity. Asked only when
// npm's recorded integrity already equals the built file's, as the plain step does: otherwise the
// bytes are known to differ and nothing is fetched.
import { downloadTarball, integrityOf } from '../../registry.mjs';

export const DOWNLOAD = Object.freeze({
  id: 'download',
  name: 'Download what npm serves',
  description: 'The integrity of the tarball npm hands out',
  make: ({ fetcher }) => async (scope) => {
    if (scope.npmIntegrity !== scope.localIntegrity) {
      scope.servedIntegrity = null;
      return;
    }
    const bytes = await downloadTarball({ fetcher, url: scope.tarballUrl });
    scope.servedIntegrity = integrityOf(bytes);
    scope.servedBytes = bytes.length;
  },
});
