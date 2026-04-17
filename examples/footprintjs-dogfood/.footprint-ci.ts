import { MockAdapter, pipeline } from '@footprintjs/ci';
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
        body: `### Features
- ship the first public release
- add GitHub Actions adapter
- add Twitter platform adapter

### Docs
- write README and examples`,
      },
    },
  },
});

const announce = releaseAnnounce({
  platforms: ['twitter'],
  manualReviewOn: 'major',
  repoUrl: 'https://github.com/footprintjs/ci',
});

export default pipeline({
  name: 'dogfood-release',
  adapter,
  triggers: ['release.published'],
  flow: () => announce.build(),
  persistence: {
    traces: { dir: './traces', commitBack: false },
  },
  // Redact platform secrets from any trace that gets written. FootPrint's
  // RedactionPolicy scrubs commit log entries; @footprintjs/ci extends it to
  // cover snapshot.sharedState too (see runner.ts).
  redaction: {
    keys: [
      'TWITTER_API_KEY',
      'TWITTER_API_SECRET',
      'TWITTER_ACCESS_TOKEN',
      'TWITTER_ACCESS_SECRET',
    ],
    patterns: [/^[A-Z_]+TOKEN$/, /^[A-Z_]+SECRET$/],
  },
});
