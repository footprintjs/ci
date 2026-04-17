# @footprintjs/release-announce

An opinionated pipeline module for [`@footprintjs/ci`](../ci) that announces releases across social platforms.

Starts with **Twitter only** in v0.1. LinkedIn comes in v0.2; dev.to in v0.3.

Under the hood, `releaseAnnounce()` builds a real FootPrint `RunnableFlowChart`. Every stage is an `addFunction` or `addDeciderFunction` on the chart — which means every read, every write, and every routing decision shows up in the causal trace produced by `FlowChartExecutor`.

## Install

```bash
npm i -D footprintjs @footprintjs/ci @footprintjs/release-announce twitter-api-v2
```

## Quick start

```typescript
// .footprint-ci.ts
import { pipeline, githubActions } from '@footprintjs/ci';
import { releaseAnnounce } from '@footprintjs/release-announce';

const announce = releaseAnnounce({
  platforms: ['twitter'],
  manualReviewOn: 'major',
  repoUrl: 'https://github.com/my-org/my-project',
});

export default pipeline({
  name: 'release',
  adapter: await githubActions(),
  triggers: ['release.published'],
  flow: () => announce.build(),
  persistence: { traces: { dir: './traces', commitBack: true } },
});
```

Required GitHub Actions secrets:

- `TWITTER_API_KEY`
- `TWITTER_API_SECRET`
- `TWITTER_ACCESS_TOKEN`
- `TWITTER_ACCESS_SECRET`

## Flow shape

The module builds this FootPrint flow:

```
ParseChangelog
    ↓
FormatContent
    ↓
ReviewGate  ─── decide()
   ├── manual → WaitForApproval
   └── auto   → AutoApprove
    ↓
PostTo<Platform>  (once per platform)
    ↓
LogMetrics  ($metric)
```

`decide()` is FootPrint's rule-based decider helper — it captures the rule that fired, so the narrative tells you *why* a release went to the manual branch, not just that it did.

## Dry-run

Set `DRY_RUN=1` (or `true`) in the environment. Platform `post()` calls return a mock result without hitting the real API. Traces still record the full flow — useful for verifying the pipeline without side effects.

## Major-version review gate

With `manualReviewOn: 'major'` and a release tag matching `v?<N>.0.0`:

1. `ReviewGate` routes to the `manual` branch via `decide()`.
2. `WaitForApproval` polls `approvalProbe()` until it returns true or times out.
3. Default poll interval: 30s. Default timeout: 1 hour. Both configurable via `reviewIntervalMs` / `reviewTimeoutMs`.

## Custom platforms

Implement the `PlatformAdapter` interface and pass it via `platformOverrides`:

```typescript
releaseAnnounce({
  platforms: ['twitter'],
  platformOverrides: { twitter: myCustomTwitterAdapter },
});
```

Community platforms (Mastodon, Bluesky, etc.) can ship as separate packages that export a `PlatformAdapter`.

## Template variants

- `default` — short, highlight-style (best for Twitter).
- `minimal` — version + URL only.
- `long-form` — markdown with sections (planned: dev.to, LinkedIn).

## License

MIT
