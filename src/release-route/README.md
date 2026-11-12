# src/release-route

The core of the shared release route: small modules, one job each, built-in Node modules only
(the workflow runs them from a plain checkout with no install). The entry is
`scripts/release-route.mjs <plan|npm-tool|build|inspect|ready|verify|tag|notes>`; tests are in
`test/release-route/`. The one exception is `chart/` (plan and verify as footprintjs charts, the
record and the `why` reader), which runs from the committed bundle; see its README.

Read `docs/RELEASE-ROUTE.md` for what each module is for and why, the settings file, the rule
table, the borrowed archive inspector in `archive/`, and (in `docs/RELEASE-ROUTE-REFUSALS.md`) every refusal.

Two rules to keep when changing anything here:

- Every stop is a code in `refusals.mjs`. A new stop adds its code and sentence there and a test
  that names it; `refusals-coverage.test.mjs` fails otherwise.
- The decision is `rules.mjs`, data only. A new row that overlaps a later one with a different
  result declares it in `outranks`, and a mode that writes requires `refIsMain: true`;
  `plan.test.mjs` fails otherwise.
