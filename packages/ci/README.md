# @footprintjs/ci

Observable, adapter-based CI/CD pipelines built on [`footprintjs`](https://github.com/footprintjs/footPrint) — the flowchart pattern for backend code.

Pipelines are real FootPrint flowcharts. Traces are real FootPrint causal traces: every read, every write, every decision captured as a narrative the runtime generates for you.

## Install

```bash
npm i -D footprintjs @footprintjs/ci
# plus the optional peer deps for the GitHub Actions adapter
npm i -D @actions/core @actions/artifact simple-git
```

## Quick start

```typescript
// .footprint-ci.ts
import { pipeline, githubActions, flowChart } from '@footprintjs/ci';

interface State {
  message: string;
}

export default pipeline({
  name: 'release',
  adapter: await githubActions(),
  triggers: ['release.published'],

  flow: () =>
    flowChart<State>('Announce', (scope) => {
      scope.message = `shipping ${scope.$getArgs<{ ref: string }>().ref}`;
    }, 'announce')
      .build(),

  persistence: { traces: { dir: './traces', commitBack: true } },
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

A named FootPrint flowchart bound to an adapter and a trigger filter. Given a matching trigger, the runner builds the flowchart, hands it to `FlowChartExecutor`, captures the narrative + snapshot, and persists the trace.

### Adapter

Pure wrapper around the host CI environment. Two ship with the library:

- **`githubActions()`** — reads `GITHUB_EVENT_*` env vars, uploads artifacts, commits back via `simple-git`. Loads its peer deps lazily so non-GH users don't pay the download cost.
- **`MockAdapter`** — records every call for assertions. Use in unit tests.

### Flow

The `flow` callback returns the result of `flowChart(name, fn, id).addFunction(...).build()` — an actual FootPrint `RunnableFlowChart`. You have the full builder API: `addFunction`, `addDeciderFunction` / `addFunctionBranch`, `addListOfFunction`, `addSubFlowChart`, `addPausableFunction`, `decide()`, `select()`.

### Trace

Every run produces a JSON trace containing:

- `narrative` — human-readable causal trace from `FlowChartExecutor.getNarrative()`
- `narrativeEntries` — structured entries keyed by `runtimeStageId`
- `snapshot` — full `RuntimeSnapshot` (sharedState, executionTree, commitLog)
- `redactionReport` — already emitted by FootPrint itself
- Pipeline metadata (flowId, adapter name, trigger info, timings)

Traces can be dropped into the [FootPrint playground](https://footprintjs.github.io/footprint-playground/) for replay.

## Redaction

Pass any FootPrint `RedactionPolicy` — it flows straight to `executor.setRedactionPolicy()`:

```typescript
pipeline({
  // ...
  redaction: {
    keys: ['ssn', 'creditCard'],
    patterns: [/^token$/i, /_SECRET$/],
    fields: { user: ['password', 'authToken'] },
  },
});
```

The runner additionally applies the same rules to `snapshot.sharedState` as a defense-in-depth pass (FootPrint scrubs the commit log; we also scrub the live state before serialization).

## CLI

- `footprint-ci run` — load the config and execute the pipeline.
- `footprint-ci validate` — build the flow without running it.
- `footprint-ci init --adapter=github-actions` — scaffold config + workflow templates.

## Adapter contract

An adapter must:

1. Expose a stable `name` string.
2. Return a `Trigger` from `readTrigger()`.
3. Return `undefined` (never throw) for missing keys in `readSecrets()`.
4. Implement `log()` without throwing.
5. Gracefully no-op on capabilities the host doesn't support (e.g. `uploadArtifact` on a local runner).

A reusable contract test lives at `test/adapter-contract.ts` — run it against any adapter you write.

## License

MIT
