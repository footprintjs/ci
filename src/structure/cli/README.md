**Adapter** — translate report command arguments into snapshots and output.

`report --repo PATH --head REF [--base REF] [--format json|text]` reads committed
trees. JSON is the default. Findings are advisory and exit 0; unsupported or
uncertain analysis stays visible in coverage. Invalid inputs, syntax errors
and tool failures produce a structured error on stderr and exit 2.
No command changes a repository, its settings, or its merge/release state.
