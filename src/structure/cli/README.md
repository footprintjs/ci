**Adapter** — translate report command arguments into snapshots and output.

`report --repo PATH --head REF [--base REF] [--format json|text]` reads committed
trees. JSON is the default. Findings are advisory and exit 0; unsupported or
uncertain analysis stays visible in coverage. Invalid inputs, syntax errors
and tool failures produce a structured error on stderr and exit 2.
No command changes a repository, its settings, or its merge/release state.

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
