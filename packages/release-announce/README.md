# @footprintjs/release-announce

An opinionated pipeline module for [`@footprintjs/ci`](../ci) that announces
releases across social platforms.

Starts with **Twitter only** in v0.1. LinkedIn comes in v0.2; dev.to in v0.3.

## Install

```bash
npm i -D @footprintjs/ci @footprintjs/release-announce twitter-api-v2
```

## Quick start

```typescript
// .footprint-ci.ts
import { pipeline, githubActions } from '@footprintjs/ci';
import { releaseAnnounce } from '@footprintjs/release-announce';

const announce = releaseAnnounce({
  platforms: ['twitter'],
  manualReviewOn: 'major',
});

export default pipeline({
  name: 'release',
  adapter: await githubActions(),
  triggers: ['release.published'],
  flow: (fp) => announce.apply(fp),
  persistence: { traces: { dir: './traces', commitBack: true } },
});
```

Required GitHub Actions secrets:

- `TWITTER_API_KEY`
- `TWITTER_API_SECRET`
- `TWITTER_ACCESS_TOKEN`
- `TWITTER_ACCESS_SECRET`

## Dry-run

Set `DRY_RUN=1` (or `true`) in the environment. Platform `post()` calls return
a mock result without hitting the real API. Traces still record the full flow
— useful for verifying the pipeline without side effects.

## Major-version review gate

When `manualReviewOn: 'major'` is set and the release tag matches
`v?<N>.0.0`, the flow routes through a `manual` branch that waits for an
`/approve` comment (via `approvalProbe`) before fanning out.

- Default poll interval: 30s
- Default timeout: 1 hour

## Custom platforms

Implement the `PlatformAdapter` interface and pass it via `platformOverrides`:

```typescript
releaseAnnounce({
  platforms: ['twitter'],
  platformOverrides: { twitter: myCustomTwitterAdapter },
});
```

Community platforms (Mastodon, Bluesky, etc.) can ship as separate packages
that export a `PlatformAdapter`.

## Template variants

- `default` — short, highlight-style (best for Twitter).
- `minimal` — version + URL only.
- `long-form` — markdown with sections (planned: dev.to, LinkedIn).

## License

MIT
