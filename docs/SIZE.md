# Size accounting

v1 does not delete existing release machinery. During shadow, Foottrace's live publisher remains in place and the shared tool adds a second read-only observation path. No net reduction is claimed.

`size-inventory.json` records physical byte-line (Python bytes.splitlines) and byte counts, with file inventories, for the pinned Foottrace baseline and current v1. Production source/config/workflows, tests/historical fixtures, generated bundle and vendor archive are separate categories. Historical fixtures remain tests and are not a second live publisher. Symlinks to production helpers are not double-counted as copied source.

The baseline compares Foottrace only. AgentFootprint, FootPrint and other repositories have not migrated; there is no hypothetical ecosystem-wide savings number. The expected benefit requires later reviewed migrations to thin callers and deletion of duplicated live implementation. Preserving refusal/effect coverage takes precedence over reducing the reported count.

| Category | Lines | Bytes |
|---|---:|---:|
| Original Foottrace helpers | 2,486 | 110,763 |
| Original Foottrace workflow | 321 | 12,207 |
| Original release tests/fixtures | 9,917 | 411,512 |
| v1 source/config/workflows | 3,285 | 161,770 |
| v1 tests/historical snapshots | 18,677 | 804,993 |
| Generated dist files | 26,701 | 1,095,795 |
| Vendored npm archive | compressed | 2,998,121 |
