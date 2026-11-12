# src/release-route/chart

The release route's `plan` and `verify` as footprintjs charts, their saved record, and the `why`
reader. They run from the committed bundle (`bin/release-route.mjs` → `dist/release-route.cjs`,
opened by `scripts/release-route-chart.mjs`); this is the only folder of the route that imports a
package (footprintjs, foottrace), and nothing outside it imports it.

| File | Job |
|---|---|
| `plan-chart.mjs`, `decision.mjs`, `verify-chart.mjs` | Wiring only: which stage follows which. |
| `stages/`, `verify/` | One stage per file: its id, name, one-line description and function. |
| `state.mjs` | What may enter state, and in what shape (facts, causes, checked context). |
| `execute.mjs` | Runs a chart with the recorders the record needs. |
| `plan-run.mjs` | Reads back from the plan chart what the plain step reads from `observe` + `plan`. |
| `record.mjs` | The record: its shape and the one way it is saved. |
| `why.mjs` | The reader: foottrace's walks, arranged into cleaned lines. |
| `steps.mjs`, `cli.mjs` | The charted steps (plan, verify, why) on the shared step runner. |

Two rules to keep: `rules.mjs` is the one owner of the decision (the decide stage only hands it
to `decide()`), and `plan.mjs` stays the oracle (`agreement-*.test.mjs` runs both on every
combination). Read `docs/RELEASE-ROUTE-CHART.md` for the drawings, the record and why.
