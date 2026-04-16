import { MockAdapter, pipeline, presetRedactionPolicies as r } from '@footprintjs/ci';
import { releaseAnnounce } from '@footprintjs/release-announce';

/**
 * Sample pipeline config — footprintjs announcing its own releases.
 *
 * Uses MockAdapter so `footprint-ci validate` works out of the box without
 * requiring a real CI environment. Swap for `await githubActions()` when
 * running inside GitHub Actions.
 */

const adapter = new MockAdapter({
  trigger: {
    event: 'release.published',
    ref: 'v0.1.0',
    payload: {
      release: {
        tag_name: 'v0.1.0',
        body: `### ✨ Features
- ship the first public release
- add GitHub Actions adapter
- add Twitter platform adapter

### 📚 Docs
- write README and examples`,
      },
    },
  },
});

const announce = releaseAnnounce({
  platforms: ['twitter'],
  manualReviewOn: 'major',
});

export default pipeline({
  name: 'dogfood-release',
  adapter,
  triggers: ['release.published'],
  flow: (fp) => announce.apply(fp),
  persistence: {
    traces: { dir: './traces', commitBack: false },
  },
  redaction: r.combine(r.apiKeys, r.envVars(['TWITTER_', 'GITHUB_'])),
});
