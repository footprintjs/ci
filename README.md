# FootPrint CI

Observable, adapter-based CI/CD pipelines powered by [FootPrint](https://github.com/footprintjs/footprintjs) flows.

This monorepo contains two packages:

| Package | Purpose |
|---------|---------|
| [`@footprintjs/ci`](./packages/ci) | Core library. Ships with a built-in GitHub Actions adapter. |
| [`@footprintjs/release-announce`](./packages/release-announce) | Opinionated app that announces releases across social platforms. |

## Quick start

Install the pieces you need:

```bash
npm i -D footprintjs @footprintjs/ci @footprintjs/release-announce \
         @actions/core @actions/artifact simple-git twitter-api-v2
```

Create `.footprint-ci.ts` in the root of your repo:

```typescript
import { pipeline, githubActions } from '@footprintjs/ci';
import { releaseAnnounce } from '@footprintjs/release-announce';

export default pipeline({
  name: 'release',
  adapter: await githubActions(),
  triggers: ['release.published'],
  flow: (fp) => fp.stage('announce', releaseAnnounce({
    platforms: ['twitter'],
  })),
  persistence: {
    traces: { dir: './traces', commitBack: true },
  },
});
```

Then:

```bash
npx footprint-ci init --adapter=github-actions
```

## Development

```bash
pnpm install
pnpm test
pnpm build
```

## License

MIT
