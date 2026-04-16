# footprintjs-dogfood

Sample pipeline config — the footprintjs project announcing its own releases.

Run from this directory:

```bash
pnpm validate         # dry-build and type-check the flow
DRY_RUN=1 pnpm run    # execute the flow against MockAdapter, no real API calls
```

Swap `MockAdapter` for `await githubActions()` in `.footprint-ci.ts` when
running inside a real GitHub Actions workflow.
