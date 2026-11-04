**Support** — deterministic source-structure measurement and advisory reports.

The checker reads source as data and imports only TypeScript and Node built-ins.
Rollout 1–2 reports findings; it grants no merge, release or settings authority.
Limits live with the pinned checker, outside the repository being checked.

`rules/` holds fixed limits, `metrics/` measures parsed syntax, `ratchet/`
compares old and new debt, and adapters read trees and write reports. This
package does not yet verify moves or replay merges.

Run from this folder with Node 22.14 or later:

```
npm ci --ignore-scripts
node cli/main.mjs report --repo /path/to/repository --head HEAD --base BASE
node cli/main.mjs report --repo /path/to/repository --format text
npm test
```

This folder has its own package and lockfile. Its sole dependency is TypeScript
5.4.5. It does not use the release tool's package, build or committed bundles.
The checker runs from its own folder with the candidate elsewhere and imports
no candidate code. See `cli/`, `sources/git/` and `reporters/` for the boundaries.

`.github/workflows/structure-report.yml` is a separate reusable report workflow.
Pin the caller and `tool_sha` input to the same reviewed full commit. The job
has only `contents: read`, installs only this package with scripts disabled,
and saves JSON plus a human summary. Findings exit 0; tool/input failures exit 2.
It is advisory and is not installed as a required check by this change.

This first report implements metrics, folder fences, static load estimates,
facades, stage bindings, references and a conservative debt comparison.
`affected`, move verification, merge replay, statement counts and calibrated
extraction credit remain follow-ups. Coverage names unsupported analysis;
absence of a finding does not claim those cases were verified.
