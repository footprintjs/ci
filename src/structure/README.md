**Support** — deterministic source-structure measurement and advisory reports.

The checker reads source as data and imports only TypeScript and Node built-ins.
Rollout 1–2 reports findings; it grants no merge, release or settings authority.
Limits live with the pinned checker, outside the repository being checked.

`rules/` holds fixed limits, `metrics/` measures parsed syntax, `ratchet/`
compares old and new debt, and adapters read trees and write reports. This
package reports whole-unit move evidence and isolated automatic merge replay.

Run from this folder with Node 22.14 or later:

```
npm ci --ignore-scripts
node cli/main.mjs report --repo /path/to/repository --head HEAD --base BASE
node cli/main.mjs report --repo /path/to/repository --format text
node cli/main.mjs affected --repo /path/to/repository --head HEAD --base BASE
node cli/main.mjs verify-move --repo /path/to/repository --head HEAD --base BASE
node cli/main.mjs verify-merge --repo /path/to/repository --head MERGE
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
Calibrated extraction credit remains a follow-up. Function JSON now includes
`statementCount`: block-body syntactic statements, excluding blocks and empty
statements, including nested bodies and erased declarations. Headers are outside
the count; expression-bodied callables report0. Metadata records this grammar.
Counts have no threshold, finding rule or ratchet effect. Coverage names unsupported analysis;
absence of a finding does not claim those cases were verified.

`affected/` estimates tests using both trees, named export owners and possible
module loading effects. It keeps file/path readers and unresolved ownership
conservative, returns compiler requirements, and always requires the full suite
before merge. It evaluates no candidate code or runner configuration and enables
no test skipping, workflow or policy change. The text view quotes filenames so
candidate-controlled path characters cannot add summary lines; JSON keeps the
original path data.

`verify-move` compares complete source statements, owned comments, binding
owners and public export names/kinds. It lists moved units and ancillary changes;
reordering, dynamic initialization, unresolved bindings and declaration-emission
limits remain named uncertainty. This is source evidence for review. Observations
exit0; invalid input, syntax and tool failures exit2. JSON retains all details;
the text summary shows counts and up to20 findings/uncertainty records.

`verify-merge` binds the commit's actual two parents and compares Git's automatic
merge in an isolated temporary object store. Clean mismatches are findings;
conflict resolutions may differ only at exact Git-reported paths. Unsupported
parent counts or non-linguist attributes remain incomplete before replay.
Git2.38 or newer is required and its actual version is recorded. Native errors
exit2; advisory findings/incomplete coverage exit0. Candidate objects, references
and settings remain unchanged. See `replay/` and `sources/git/replay/`.
