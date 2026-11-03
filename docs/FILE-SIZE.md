# Shared source file-size ratchet

Every tracked file under `src/`, including documentation, is counted from the committed Git tree. A physical line ends at LF; a nonempty unterminated final line also counts. CRLF counts once. Empty files have zero lines. Local uncommitted and untracked files are outside this committed-tree check. Symlinks and submodules within the scope are refused.

The fixed ceiling is 600 lines. Each library commits `.file-size-baseline.json`:

```json
{
  "files": { "src/existing-large.ts": 701 },
  "exclude": []
}
```

Seed only files that were already oversized at the comparison base. Record their actual current counts. An existing entry cannot increase, and a new oversized file cannot receive a new exception. Whenever an oversized file shrinks, tighten its entry to the measured size in the same PR. At 600 lines or below, or after deletion, remove its entry. Split files instead of raising caps.

Generated, vendored or test files require explicit exclusions in this same file: for example `{ "path": "src/generated/", "reason": "generated" }`. Paths are exact files or directories ending in `/`; there are no inferred extensions or glob patterns. Reasons are `generated`, `vendored` or `test`. The exclusion list may only shrink after its initial seed. Tests outside `src/` are outside the stated source scope.

Call `.github/workflows/file-size.yml` at a reviewed full commit, passing that identical commit as `tool_sha`. For a release build, pass its actual pinned plan commit as `source_sha`; the check then uses that commit and its first parent, independently of a possibly queued triggering event. The reusable workflow installs no project dependencies, executes no candidate scripts, uses read-only permissions and compares the candidate merge tree against the event's PR base or previous push commit. A missing or all-zero base is refused. Require the actual emitted reusable check in the library's main-branch ruleset before declaring adoption complete.

```yaml
jobs:
  file-size:
    uses: footprintjs/ci/.github/workflows/file-size.yml@FULL_REVIEWED_COMMIT
    with:
      tool_sha: FULL_REVIEWED_COMMIT
```

For a local committed-tree check, run:

```sh
node /path/to/ci/scripts/file-size.mjs --repo /path/to/library --base FULL_BASE_COMMIT
```

This check changes no files, baselines or repository settings. It does not replace a library's build, tests or release authorization. A caller's release fallback must also invoke the check if it can build a tree without the required PR gate.
