**Support** — pure policy for an automatic two-parent merge replay.

`verifyMerge({head,replay})` compares trusted Git observations as data. Its result
has `verification:'merge'`, head/parent/tree IDs, observed replay status/tree/Git
version/conflict paths, findings, coverage and explicit entry differences. Tool
or malformed input throws; callers map that failure to exit2. Findings and
incomplete coverage are advisory observations, never a passed merge verdict.

`preflight` checks IDs, observed Git2.38 minimum, and all three explicitly labeled
attribute trees: actual head and both parents. Only the finite linguist-* metadata
grammar is admitted. Other settings, quoted/escaped pattern syntax, unreadable
attributes and symlinks stay incomplete. Unsupported parent counts stay
incomplete without a two-parent replay. Native callers run preflight BEFORE Git.

`output` accepts only the pinned `merge-tree --write-tree --name-only
--no-messages -z` format. Exit0 requires exactly one NUL-terminated tree ID;
exit1 requires that tree then zero or more exact NUL-terminated conflict paths.
Exit1 with no paths stays incomplete even when trees match. Missing refs, other
statuses and malformed/truncated output are tool errors; stderr is not parsed
for conflict names. Raw text must already have strict UTF8 decoding by the port.

`entries` retains file mode, type and OID, including symlinks, gitlinks and EMPTY
trees. Nonempty directory entries are derived and omitted; adapters must supply
every leaf and empty tree. `compare` requires exact tree equality for clean
replays. For conflicted replays only exact Git-reported paths may differ; a
prefix grants no neighbouring permission. Equal tree IDs with unequal canonical
entries are incoherent tool data. No tree rehash or object provenance is claimed.

The native adapter owns object-store isolation, Git version/output collection,
complete entry/attribute discovery, disabled hooks/drivers/templates/config and
all process cleanup. This folder has no filesystem/process port and never reads
candidate config, loads candidate code or executes Git. Synthetic fixtures prove
policy; they do not prove the native isolation boundary. No replay timing is
part of deterministic public JSON.
