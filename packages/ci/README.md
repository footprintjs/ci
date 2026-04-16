# @footprintjs/ci

Observable, adapter-based CI/CD pipelines powered by FootPrint flows.

## Install

```bash
npm i -D footprintjs @footprintjs/ci
# plus the optional peer deps for the GitHub Actions adapter
npm i -D @actions/core @actions/artifact simple-git
```

## Quick start

```typescript
// .footprint-ci.ts
import { pipeline, githubActions } from '@footprintjs/ci';

export default pipeline({
  name: 'release',
  adapter: await githubActions(),
  triggers: ['release.published'],

  flow: (fp) => fp.stage('hello', async (_input, ctx) => {
    ctx.adapter.log('info', `shipping ${ctx.trigger.ref}`);
    return { ok: true };
  }),

  persistence: {
    traces: { dir: './traces', commitBack: true },
  },
});
```

Run it:

```bash
npx footprint-ci run
```

Scaffold for a fresh repo:

```bash
npx footprint-ci init --adapter=github-actions
```

## Concepts

### Pipeline

A pipeline is a named flow bound to an adapter and a set of triggers. Given a
real trigger event, the runner builds the flow, executes it, captures a trace,
and persists the trace.

### Adapter

An adapter is a pure wrapper around the host CI environment. Two adapters ship
with the library:

- **`githubActions()`** — reads `GITHUB_EVENT_*` env vars, uploads artifacts,
  commits back via `simple-git`. Loads its peer deps at call time so non-GH
  users don't pay the download cost.
- **`MockAdapter`** — records every call for assertions. Use in unit tests.

Adapters implement the `CIAdapter` interface (see `src/adapters/types.ts`).
The contract is intentionally narrow; write your own for GitLab, CircleCI,
Buildkite, etc.

### Module

A module is a reusable flow fragment — a named callback over the builder.

```typescript
import { module } from '@footprintjs/ci';

const announce = module('announce', (fp) =>
  fp.stage('parseChangelog', parseChangelog)
    .stage('postTweet', postTweet)
);
```

### Trace

Every run produces a JSON trace: stages, durations, outputs, retries, redaction
report. Traces are written atomically to `./traces/` by default and can
optionally be uploaded as GH artifacts and/or committed to the repo.

## Redaction

Wire up `presetRedactionPolicies` to strip secrets before traces hit disk:

```typescript
import { pipeline, presetRedactionPolicies as r } from '@footprintjs/ci';

pipeline({
  // ...
  redaction: r.combine(
    r.apiKeys,
    r.envVars(['TWITTER_', 'GITHUB_']),
  ),
});
```

## CLI

- `footprint-ci run` — load the config and execute the pipeline.
- `footprint-ci validate` — build the flow without running it.
- `footprint-ci init --adapter=github-actions` — scaffold config + workflow
  templates.

## Adapter contract

An adapter must:

1. Expose a stable `name` string.
2. Return a `Trigger` from `readTrigger()`.
3. Return `undefined` (never throw) for missing keys in `readSecrets()`.
4. Implement `log()` without throwing.
5. Gracefully no-op on capabilities the host doesn't support
   (e.g., `uploadArtifact` on a local runner).

The library provides a reusable contract test in
`test/adapter-contract.ts` — run it against any adapter you write.

## License

MIT
