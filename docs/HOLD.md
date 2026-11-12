# Release hold check

**While an open issue or pull request in a repository carries the label `hold-release`, nothing releases from that repository.**

## Why

On 12 Nov 2026 the owner told one working session to hold a release, and another session, which could not see that conversation, published it an hour later. A published npm version cannot be taken back, so a hold has to live where every session and every workflow can see it: in the repository, read by a machine.

## Setting and lifting a hold

- Set: label any issue or pull request `hold-release` (create the label once per repository). Put the reason and who to ask in the item's text.
- Lift: remove the label, or close the item.
- Anyone who can label issues can set a hold. A hold only ever blocks, so the worst a wrong label does is delay a release; there is deliberately no allow-list of who may set one.

## Two modes, one implementation

| Mode | Used by | Fails when |
|---|---|---|
| `publish` | the FIRST job of a repository's publish workflow; every other job `needs` it | any hold is open |
| `pull-request` | a pull-request workflow | a hold is open AND this pull request changes `package.json` `version` (a release or heading pull request). A pull request that leaves the version alone always passes: a hold stops releases, not ordinary work. |

A pull request that itself carries the label is a hold like any other: it blocks releases, and it is blocked only if it also changes the version.

What a blocked person sees (every line is built by `src/hold/decide.mjs`):

```text
Hold check FAILED: a release is on hold in footprintjs/example.
Open items labelled "hold-release" (2):
  - #12 "Hold 10.8 until the review lands" https://github.com/footprintjs/example/issues/12
  - #15 (pull request) "Release 10.8.0 heading" https://github.com/footprintjs/example/issues/15
This pull request changes the package.json version (10.7.0 -> 10.8.0), so it is a release or heading pull request.
Ask whoever set the hold. To lift it, remove the label or close the item.
A pull request that leaves the package.json version alone is not blocked.
```

This is the `pull-request` output; `publish` mode omits the version line and the last line.

## Caller snippets

Pin `uses:` and `tool_sha` to the same reviewed full `footprintjs/ci` commit. The caller must grant the three read scopes: a reusable workflow cannot raise its caller's permissions.

First job of a publish workflow, everything else `needs` it:

```yaml
permissions:
  contents: read
  issues: read
  pull-requests: read
jobs:
  hold:
    uses: footprintjs/ci/.github/workflows/hold.yml@FULL_REVIEWED_COMMIT
    with:
      tool_sha: FULL_REVIEWED_COMMIT
      mode: publish
  publish:
    needs: hold
    # ... the repository's existing publish job
```

A pull-request job (a repository that wants it required adds the emitted check to its main-branch ruleset):

```yaml
on:
  pull_request:
permissions:
  contents: read
  issues: read
  pull-requests: read
jobs:
  hold:
    uses: footprintjs/ci/.github/workflows/hold.yml@FULL_REVIEWED_COMMIT
    with:
      tool_sha: FULL_REVIEWED_COMMIT
      mode: pull-request
```

`pull-request` mode runs only for the `pull_request` event. It checks out the pull request's merge commit M (`refs/pull/N/merge`) and PROVES that is what it has: M must have exactly two parents and the second must equal the pull request's head SHA from the event. It then compares `package.json` `version` at M's first parent (the base tip the merge was really made on) with M itself. It never uses the event's recorded base SHA: if the base branch moved and bumped the version after that SHA was recorded, an ordinary pull request would look like a release (and the mirror case could hide one). Comparing M with its own first parent gives "unchanged" whatever the base branch did. The repository must have a root `package.json` with a string `version`.

`pull_request_target` is NOT supported and fails: it runs against the base branch with no merge commit, so there is nothing to prove, and its higher-privilege token must not be combined with a checkout of a pull request's code.

## It fails closed

A release gate that says "no hold" because it could not look is worse than none. These all fail the job with a message that says it could not check:

- the request fails, times out, is rate-limited (HTTP 403 or 429), is answered with a redirect or any non-2xx status, is not JSON, is not a list, has an item without a number or title, or has a page of more than 100 items;
- a later page fails, or more than 500 open items carry the label (the bound is 5 pages of 100; past it the check refuses rather than guess);
- `pull-request` mode and a version that cannot be read on either side (no file, not JSON, no string `version`, an empty one), or an event that is not exactly `pull_request`, a head SHA that is missing, all zeros or not 40 lowercase hex characters, a checkout that is not a merge commit with exactly two parents, or a second parent that is not the pull request's head SHA, with or without a hold open;
- an unknown `mode`, a malformed `tool_sha`, a missing or malformed repository name, a missing or malformed token.

Nothing turns an exception into a pass.

## Safety

- Titles and versions are text the check does not control. Control, bidirectional-format and separator characters are removed, whitespace collapses, text is cut, and no printed line starts with untrusted text, so a title cannot start a `::` workflow command.
- `tool_sha`, `mode`, the event name and the pull request head SHA reach the scripts through `env:` only, are validated, and are never interpolated into a `run:` script.
- The token is the job's read-only `GITHUB_TOKEN`. It is sent in one header to `api.github.com` (or `GITHUB_API_URL`), never followed through a redirect, and never put in a message; if a library ever did, it is masked in the output.
- A pull request from a fork runs with a read-only token and needs no secret.

## What it does NOT do

- It does not stop a person with write access who goes around the workflow (a local `npm publish`, a different workflow without this job). It stops the workflows that call it.
- It does not check who set the label, and it does not know about holds in other repositories.
- A hold set AFTER a pull request's check ran does not turn that old check red. The `publish`-mode check, which runs at publish time, is the guarantee.
- It does not stop ordinary merges: in `pull-request` mode only a pull request that changes `package.json` `version` is blocked.
- It is not a release approval. A passing check means "no hold is open", nothing more.
- Adopting it in a repository is a separate, reviewed change to that repository's workflows and ruleset.

Developers: the decision is the pure `src/hold/decide.mjs`; `src/hold/run.mjs` wires the request (`http.mjs`, `list-holds.mjs`) and git (`versions.mjs`) into it, both injected so tests make no network call. The command is `scripts/hold.mjs`. It does not use `src/github-readonly.mjs`: that client's routes are fixed to a single other repository and its allow-list refuses the `state` and `labels` query keys, so widening it would loosen a separately reviewed boundary.
