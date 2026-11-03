# Read-only eco component boundaries

These units support the separate read-only status feature. They do not install a
caller, write policy, approve a merge, authorize publishing or authenticate AI.
The bounded GitHub GET driver, native FootPrint status flow and saved-record CLI
are implemented. See [ECO.md](ECO.md) for Beta usage and operational limits.

The verdict comment syntax remains v1. Its matcher establishes conditional
metadata agreement only. Account attribution is cooperative; driver provenance,
prior trusted policy, actual checks and effect admission remain separate.

## Observation receipt format

Migration: the unpublished `eco-verdict-observations-v1` component receipt is
replaced by v2, with a distinct `firstObservedSequence`. Old receipts remain
historical artifacts; this reader refuses to use them as proven current history.
It does not infer new history or migrate missing creation positions.

A newly seen comment has unknown creation and breaks coverage of the current
epoch for every author/body. It cannot supply a pass or leave an older pass
matched. Rereading an already positioned unchanged comment is harmless. Edits
and deletion retain invalidation. A real new head-push can start a new epoch;
only fresh creation after that push can support a matching verdict. First-observed
position is never promoted to creation position. An envelope must agree with its
first event; empty batches establish no new history. Exact replay is inert.

`continuous` remains a producer claim requiring independent driver binding.
Current-page snapshots cannot prove creation-after-push or erased-history absence.

## Data admission

The one-MiB aggregate JSON UTF8 budget is charged during traversal, including
escaping, keys, repeated values and container punctuation, before a detached
piece is retained. Node/depth/field limits also apply. Callers may lower the byte
budget for bounded controls, never raise it. No whole unadmitted tree is
serialized to determine its size. Internal Foottrace budgeting helpers are not
public exports of the pinned dependency, so no internal subpath is imported.

Own data descriptors, dense arrays, finite integers and cycle checks avoid
ordinary getters/toJSON conversion hooks. Reflection on JavaScript Proxies can
run traps; this is not a hostile-code sandbox. External readers must admit
bounded JSON bytes first. Failures return static codes without input echo.


Migration: the unpublished internal github-get transport is now github-transport, with createGitHubTransport; all internal callers migrate together, without a compatibility alias. GET/registry views remain read-only. The separate exact-title/body PATCH view binds one repository, pull number and canonical UTF8 payload, shares the captured owner's response/request/cancellation bank, and admits at most one PATCH attempt per owner. It is an internal IO component, not a domain permission: full current writer/eligibility, native pre-effect capture, immediate rechecks and C1 GET reconciliation are still required before production wiring. A new owner does not itself establish later-run eligibility. No writer is exported by the read-only inspection program; no non-idempotent submission is admitted here.

The opaque runtime owner now identifies its scope as captured-native-http-owner; it does not label all its capabilities read-only. Individual GET facets enforce that boundary. Inspection reports still describe only their actual GET-only operation. No serialized owner label reconstructs its private CODE brand.

Current native preparation now computes desired title/body through the same native proposalMetadata formatter used by the existing proposal writer. The extracted formatter preserves the original writer request bytes; its policy text has one owner. Computed projection validates primitive version/notes and UTF8/size before formatting, then applies the exact metadata envelope limits.

The current-only native history chart observes actual PR metadata against this computed payload and repeats the observation after its history and signed/reference/review recheck. Matching or stale metadata is input knowledge; malformed or drifting metadata holds. Only digest references and match facts enter the native record. The exact desired payload stays in the private runtime backend. Retained-attempt classification remains separately reported if a later metadata read holds. This source still grants no writer, does not perform a PATCH, and implements neither C1 effect orchestration nor full native eligibility.

The native metadata/history factory now exposes its existing chart for composition in one owning executor. It identifies the native result stage so the owner can observe the actual completed prefix before its next stage; the stage name and backend accessor are input knowledge, never a completion or permission receipt. The standalone facade still discards backend data when final native capture is incomplete. Each captured factory is single-use: a second execution clears its backend and refuses before provider I/O. Fresh invocations create new factories and must reacquire all domain predicates. DATA options cannot choose a predecessor chart for the standalone facade.
