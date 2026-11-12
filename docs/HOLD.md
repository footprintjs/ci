# Release hold check

**While an open issue or pull request in a repository carries the label `hold-release`, nothing releases from that repository.**

## Why

On 12 Nov 2026 the owner told one working session to hold a release, and another session, which could not see that conversation, published it an hour later. A published npm version cannot be taken back, so a hold has to live where every session and every workflow can see it: in the repository, read by a machine.

## Setting and lifting a hold

- Set: label any issue or pull request `hold-release`. Put the reason and who to ask in the item's text.
- Lift: remove the label, or close the item.
- Create the label once per repository and pick it from the list. GitHub's label filter ignores letter case, so `Hold-Release` also holds; apart from case the name is exact, so `hold release`, `hold_release` or `on-hold` hold nothing, and nothing warns about a misspelt label.
- Anyone who can label issues can set a hold. A hold only ever blocks, so the worst a wrong label does is delay a release; there is deliberately no allow-list of who may set one.
- Issues must be enabled in the repository: with issues turned off GitHub refuses the listing and every check fails (safe, but every release is then blocked).

## Three places the check runs, one implementation

All three run `scripts/hold.mjs`; the rule is decided in one pure function (`src/hold/decide.mjs`).

| Form | Where | Mode | Fails when | What it is for |
|---|---|---|---|---|
| **Step** (the composite action `.github/actions/hold`) | in the publish job, directly before `npm publish` | `publish` (fixed, no input) | any hold is open | **what holds.** It runs again whenever the job runs again. |
| **Job** (the reusable workflow `hold.yml`) | the first job of a publish workflow, the publish job `needs` it | `publish` | any hold is open | the early, visible signal: a held release stops before it spends minutes on install, build and tests. It does NOT hold on a re-run. |
| **Pull-request job** (the same `hold.yml`) | a pull-request workflow | `pull-request` | a hold is open AND this pull request changes `package.json` `version` (a release or heading pull request). A pull request that leaves the version alone always passes: a hold stops releases, not ordinary work. | keeps a release or heading pull request red while a hold is open. |

**Why the step, and not only the job.** GitHub's "Re-run failed jobs" and "Re-run this job" do not run a job that already succeeded: its old green result is reused. So if the publish job fails (an npm hiccup, a flaky test), someone sets a hold, and someone clicks "Re-run failed jobs", the `hold` job is NOT run again, `needs: hold` is still satisfied, and the package is published during the hold. That is exactly what a second session does. Only a check that runs again in the SAME job as `npm publish`, directly before it, sees the hold at that moment. A repository that publishes must have the step; the job is optional but useful. Either check covers the moment it ran, not a later one: a hold set in the seconds between the step and `npm publish` is not seen.

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

This is the `pull-request` output; `publish` mode (job and step) omits the version line and the last line.

## Caller snippets

Put `permissions:` on the JOB, not at the top of the file. A pasted top-level block would replace the workflow's own and silently drop `id-token: write`, which trusted publishing needs. A job that has its own `permissions:` lists everything it needs; the publish job must add `issues: read` and `pull-requests: read` for the step. A reusable workflow cannot raise its caller's permissions: a caller that does not grant the three read scopes gets a startup failure, which is safe.

A publish workflow: the `hold` job first, and the step directly before `npm publish`. Pin both to the same reviewed full `footprintjs/ci` commit.

```yaml
jobs:
  hold:
    permissions:
      contents: read
      issues: read
      pull-requests: read
    uses: footprintjs/ci/.github/workflows/hold.yml@FULL_REVIEWED_COMMIT
    with:
      tool_sha: FULL_REVIEWED_COMMIT
      mode: publish
  publish:
    needs: hold
    runs-on: ubuntu-24.04
    permissions:
      contents: read
      id-token: write        # keep what this job has today (trusted publishing)
      issues: read           # added for the hold step
      pull-requests: read    # added for the hold step
    steps:
      # ... checkout, setup-node, install, build, test ...
      - uses: footprintjs/ci/.github/actions/hold@FULL_REVIEWED_COMMIT
      - run: npm publish
```

The step has one pin: the action runs the script of its own commit (`scripts/hold.mjs`, found from `$GITHUB_ACTION_PATH`), so there is no `tool_sha` to keep in step. Its one input is `token` (default: the job's token, which needs the two read scopes above); the mode is fixed to `publish`. It uses the Node already on the runner (run `actions/setup-node` earlier in the job) and fails, with a line that says so, if `node` is missing or older than `package.json` `engines` of that commit asks. It installs and checks out nothing.

A pull-request job (a repository that wants it required adds the emitted check to its main-branch ruleset):

```yaml
on:
  pull_request:
jobs:
  hold:
    permissions:
      contents: read
      issues: read
      pull-requests: read
    uses: footprintjs/ci/.github/workflows/hold.yml@FULL_REVIEWED_COMMIT
    with:
      tool_sha: FULL_REVIEWED_COMMIT
      mode: pull-request
```

The workflow form does not compare `tool_sha` with the `uses:` pin: `hold.yml` of one commit would run the scripts of another without a word. Set both to the same commit; the action form has one pin, so it cannot drift.

`pull-request` mode runs only for the `pull_request` event. It checks out the pull request's merge commit M (`refs/pull/N/merge`, two levels deep: M and its two parents are all it reads) and PROVES that is what it has: M must have exactly two parents and the second must equal the pull request's head SHA from the event. It then compares `package.json` `version` at M's first parent (the base tip the merge was really made on) with M itself. It never uses the event's recorded base SHA: if the base branch moved and bumped the version after that SHA was recorded, an ordinary pull request would look like a release (and the mirror case could hide one). Comparing M with its own first parent gives "unchanged" whatever the base branch did. The repository must have a root `package.json` with a string `version`.

`pull_request_target` and a merge queue (`merge_group`) are NOT supported and fail: `pull_request_target` runs against the base branch with no merge commit, so there is nothing to prove, and its higher-privilege token must not be combined with a checkout of a pull request's code; a queue's commit has a different proof, which this check does not implement, so a repository that makes the pull-request job required and uses a merge queue would see every queue run fail.

## The command's inputs

`scripts/hold.mjs` reads exactly these environment variables. They are a contract: the workflow, the action and (soon) the shared release route all depend on these names, so a rename or a new meaning is a breaking change that needs every caller changed together.

| Variable | Meaning | Missing or unusable |
|---|---|---|
| `HOLD_MODE` | `publish` or `pull-request` | exit 1, could not check |
| `GH_TOKEN` | read-only token (issues and pull requests); sent in one header to the API host, never printed | exit 1, could not check |
| `GITHUB_REPOSITORY` | `owner/name` of the repository whose labels are read (the runner sets it to the CALLER's repository, also inside a reusable workflow) | exit 1, could not check |
| `GITHUB_API_URL` | API base, a plain `https` URL; default `https://api.github.com` (the runner sets it) | a value that is not a plain https URL: exit 1 |
| `HOLD_EVENT_NAME` | the caller's event name; `pull-request` mode accepts only `pull_request` | `pull-request` mode: exit 1 |
| `HOLD_HEAD_SHA` | the pull request's head commit (40 lowercase hex), proof of which merge commit was checked out | `pull-request` mode: exit 1 |
| `HOLD_SOURCE_DIR` | the git checkout `pull-request` mode reads, default `.` | `pull-request` mode: a directory that is not a merge checkout: exit 1 |

Only `publish` mode needs the first three (and optionally `GITHUB_API_URL`); the last three are read in `pull-request` mode only. Exit status: 0 only when the decision is "no hold" (or, in `pull-request` mode, "this pull request leaves the version alone"); everything else, including every failure to look, is 1.

## This repository's own run

`.github/workflows/check.yml` runs both forms on every push and pull request of `footprintjs/ci`: the job `hold-step` runs the local action, and the job `hold-workflow` calls the local `hold.yml` in `pull-request` mode (pull requests only). They are red while an open issue or pull request in `footprintjs/ci` carries `hold-release`; `hold-workflow` stays green for a pull request that leaves the version alone. That is the check telling the truth, not a flake: lift the hold (or ask whoever set it) rather than re-running. Neither job is meant to be a required check of this repository.

## It fails closed

A release gate that says "no hold" because it could not look is worse than none. These all fail the job or step with a message that says it could not check:

- the request fails, times out, is rate-limited (HTTP 403 or 429), is answered with a redirect or any non-2xx status, is not JSON, is not a list, has an item without a number or title, or has a page of more than 100 items;
- a later page fails, or more than 500 open items carry the label (the bound is 5 pages of 100; past it the check refuses rather than guess);
- `pull-request` mode and a version that cannot be read on either side (no file, not JSON, no string `version`, an empty one), or an event that is not exactly `pull_request`, a head SHA that is missing, all zeros or not 40 lowercase hex characters, a checkout that is not a merge commit with exactly two parents, or a second parent that is not the pull request's head SHA, with or without a hold open;
- an unknown `mode`, a malformed `tool_sha`, a missing or malformed repository name, a missing or malformed token;
- in the step form: no `node`, a `node` older than `engines` asks, an unknown action path, a missing script, an unreadable `package.json`.

Nothing turns an exception into a pass.

## Safety

- Titles and versions are text the check does not control. Control, bidirectional-format and separator characters are removed, whitespace collapses, text is cut, `::` and `##[` are broken up wherever they appear (so `a ::error:: b` prints as `a : :error: : b`: the runner reads a command starting with `::` at the start of a line and one starting with `##[` anywhere in a line), and no printed line starts with untrusted text.
- `tool_sha`, `mode`, the event name and the pull request head SHA reach the scripts through `env:` only, are validated, and are never interpolated into a `run:` script; the action has no `${{ }}` inside its `run:` either.
- The token is the job's read-only `GITHUB_TOKEN`. It is sent in one header to `api.github.com` (or `GITHUB_API_URL`), never followed through a redirect, and never put in a message; if a library ever did, it is masked in the output.
- A pull request from a fork runs with a read-only token and needs no secret.

## What it does NOT do

- It does not stop a person with write access who goes around the workflow (a local `npm publish`, a different workflow without this step). It stops the workflows that call it.
- It does not check who set the label, and it does not know about holds in other repositories.
- It checks the moment it ran. The `hold` JOB does not run again on "Re-run failed jobs" or "Re-run this job"; the step does, because it is in the job that is re-run. A hold set after a pull request's check ran does not turn that old check red.
- It does not stop ordinary merges: in `pull-request` mode only a pull request that changes `package.json` `version` is blocked.
- It is not a release approval. A passing check means "no hold is open", nothing more.
- Adopting it in a repository is a separate, reviewed change to that repository's workflows and ruleset.

Developers: the decision is the pure `src/hold/decide.mjs`; `src/hold/run.mjs` wires the request (`http.mjs`, `list-holds.mjs`) and git (`versions.mjs`) into it, both injected so tests make no network call. The command is `scripts/hold.mjs`; the step form is `.github/actions/hold/action.yml`, a few lines of bash that call it. Tests spawn the real command (and the action's real `run:` script) with `test/hold/support/fetch-stub.mjs` loaded by `node --import`. It does not use `src/github-readonly.mjs`: that client's routes are fixed to a single other repository and its allow-list refuses the `state` and `labels` query keys, so widening it would loosen a separately reviewed boundary.
