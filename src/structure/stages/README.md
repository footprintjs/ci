**Support** — measure syntax-proven FootPrint stage callback registrations.

`index` only reexports `stageAnalysis(parsed, measurement)`. `analyze` returns
JSON-only `{findings,unverified,stages}`. Findings use the shared fixed limits and
deduplicate rule/unit identity; each stage retains its callback offsets and the
actual registering call's path, line, offsets and method. No candidate runs.

`methods` holds the source-reviewed callback positions and fluent return states;
`receivers` follows admitted constructors/factories/chains; `registrations`
distinguishes known registrations, unrelated values and unknown receivers.
`callbacks` handles functions, both pausable halves, and literal list `fn` fields.
`choice` requires this body's real imported `decide`/`select` call, excluding
nested callable bodies; selectors require `select`. `measure` applies the fixed
40-line/8-complexity stage limits and missing-choice predicate.

Only exact published `footprintjs` import origins are currently admitted. Import
aliases, namespace calls and finite const aliases retain that provenance; spelling
alone does not. Relative imports inside footprintjs itself remain explicitly
unverified until the parent supplies verified repository/export-owner metadata.
Unknown factory results, mutable/cyclic aliases, imported unavailable callbacks,
computed calls, spreads/accessors and unsupported forms retain `stage-binding`
uncertainty. Arbitrary local wrappers are not evaluated as framework factories.

Lazy subflow/chart resolvers, parallel item/branch adapters, retry operations and
detach mappers are not directly registered StageFunctions. Their generated wrapper
stages belong to the builder implementation, not fabricated callbacks here.
This finite syntactic policy is not a runtime/type, aliasing, execution-order or
semantic choice proof. Reflective mutation/external escapes need additional
provenance admission; no whole-program completeness is claimed.

The checker combines stage observations with metrics and coverage. Tests beside
these modules cover admitted registrations and conservative unknown cases.
