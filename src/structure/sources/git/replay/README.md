**Adapter** — replay a two-parent merge in a checker-owned bare object store.

The source repository supplies raw commit/tree/blob data only. No working tree
is checked out; hooks, templates, inherited Git overrides, user/system attributes,
lazy fetch, replacement refs and transport are disabled. Source objects are
read-only alternates. New merge objects live only in an owned temporary store,
removed on success or failure. Source configuration is not copied into it.

`commit`, `entries` and `attributes` bind raw metadata before execution.
Canonical tree inventory preserves blobs, modes, symlinks, gitlinks and empty
subtrees; derived nonempty directory entries are omitted. Attributes are read in
the actual merge and both parent trees. Unsupported attributes prevent replay.

The native port returns raw exit status/stdout/stderr. It uses
`merge-tree --write-tree --name-only --no-messages -z`, whose NUL protocol is
pinned against real Git. Pure policies under `structure/replay` decide findings
and incomplete coverage; a failed process/read is never evidence of absence.
Each process is bounded at30 seconds and256MiB. Attribute text uses the existing
8MiB strict-UTF8 input limit; unreadable attribute semantics remain incomplete.
No compiler, candidate driver/configuration, network or candidate code executes.
