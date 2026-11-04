**Adapter** — read exact Git commit trees as data, without checking them out.

`readGitSnapshot(repo, revision)` resolves one commit and reads raw blobs through
Git's batch protocol. It never imports candidate code, follows symlinks, uses
text conversion, installs packages or runs hooks. Inherited Git environment
overrides are removed; optional locks, lazy fetch and replacement refs are off.
Code, Markdown, package manifests and attributes are strict UTF-8 text; other
entries retain their paths, object ids and modes with `content: path-only`.
The empty `text` on those entries is a path-inventory placeholder, not a claim
that the blob is empty. Selected text symlinks and invalid inputs are errors.

Each Git read is bounded at 30 seconds and 256 MiB; each text blob at 8 MiB.
This adapter reads existing objects only. Merge replay is a separate adapter.

The advisory workflow compares a pull-request merge candidate with its actual
first parent. The PR event/API base SHA can lag behind that parent when main
moves, so using it can attribute another PR's changes to this one. Non-PR events
retain their supplied/event base; a PR candidate without a parent is an error.
The adjacent real-Git fixture executes this workflow selection and checks the
resulting structural delta as well as push and missing-parent controls.
