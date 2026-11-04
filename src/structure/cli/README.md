**Adapter** — translate report command arguments into snapshots and output.

`report --repo PATH --head REF [--base REF] [--format json|text]` reads committed
trees. JSON is the default. Findings are advisory and exit 0; unsupported or
uncertain analysis stays visible in coverage. Invalid inputs, syntax errors
and tool failures produce a structured error on stderr and exit 2.
Commands preserve candidate objects, settings and references.

`affected --repo PATH --base REF [--head REF] [--format json|text]` returns an
advisory test-selection estimate with reasons and coverage. It reads both
committed trees and never runs the selected tests. Its base is mandatory.
Compiler-only classification requires supported erased syntax. Unresolved
loading selects conservatively. The full suite remains required before merge;
this command changes no workflow or draft behavior.

Affected output starts with the selected/known ratio and counts of unique tests
per reason; reason groups may overlap. Supported literal runner discovery is
read as syntax data. Missing or opaque discovery keeps selection conservative.

`verify-move --repo PATH --base REF [--head REF] [--format json|text]` reads two
exact trees and reports whole-unit moves, findings, coverage and ancillary
changes. The base is mandatory. Data observations exit0; input/syntax/tool
failures exit2. It evaluates no candidate package or source. JSON identities
bind the observations to the two commits, and incomplete cases retain reasons.

`verify-merge --repo PATH [--head REF] [--format json|text]` replays the actual
two parents in a disposable owned object store. It does not accept `--base`.
Git version and exact conflict paths are recorded. Unsupported parent counts or
attributes remain incomplete; tool/input errors exit2, observations exit0.
No checkout, hook, candidate driver/configuration or candidate package runs.
