# Beta: read-only eco status

This source command implements the observe/admit/diff/report prefix of the
accepted ops design. It has no merge, release, policy writer, publisher, grant,
reservation or live-cutover command. The existing release executable and its
source/archive/App/OIDC/history guards are unchanged.

Use Node22.14+ and the pinned source dependencies (`npm ci --ignore-scripts`).
From this checkout:

```sh
npm run eco -- status --repo footprintjs/ci --pr <PR-number> --output eco-evidence
npm run eco -- explain --record eco-evidence/record.json --key reportFacts
npm run eco -- explain --record eco-evidence/record.json --key observeSources
npm run eco -- explain --record eco-evidence/record.json --key observeReceipt
```

The output directory must be new. It contains a native `record.json`, a short
`report.json` and a digest manifest. Files are exclusive and private by default;
failed writes may leave partial evidence, which must be retained as incomplete.
`explain` performs bounded local JSON reading and native Foottrace slicing only.
It does not construct a transport, replay the workflow or refresh authority.
Exit codes:0 known read-only facts,1 held/argument/artifact failure,2 unknown,
3 incomplete native recording. Every report says `authorized:false` and zero
external writes. Without a target or trusted policy pins, unknown is expected.

## Prior policy, not candidate authority

Supply the separately chosen operator pins together, without credentials in args:

```sh
npm run eco -- status --repo footprintjs/ci --pr <PR-number> \
  --policy-commit <40-hex-known-prior-policy-anchor> \
  --policy-sha256 <64-hex-exact-policy-file-digest> --owner-id <numeric-owner-ID> \
  --action merge-source --output fresh-eco-evidence
```

`--action` is exactly `merge-source`, `release` or `policy`. The numeric owner is
cooperative account attribution; it is not authenticated AI identity. There is no
new account, credential, trust setting or active ledger created by the command.
An optional already-existing `GH_TOKEN` is sent only to fixed GitHub API GETs.

The collector checks main/anchor ancestry, exact file blob and UTF8/body digest,
then reads finite versions/work from the admitted prior-main commit. For a ci PR,
prior policy must match its observed current base and differ from its candidate.
Policy changes need a separately reviewed updated anchor; no implicit migration
or candidate approval is inferred. Missing/unreadable files are unknown, never
invented absence or a newly seeded empty ledger. Desired versions, candidates and
work rows are desired state, not npm observations or grants. Candidate mismatches
are findings. Per-repo holds/actions and global release pause remain distinct;
checks declared by that pinned policy match their exact head, name, App ID and latest observed attempt. The command does not independently discover the platform protection roster.
Foottrace's native approval profile is not replaced by the comment syntax reader.

## What the record can establish

The actual workflow uses native FootPrint function stages and `decide` branches:

```text
observe → observation decision → admit → admission decision
        → diff → findings decision → report → report decision
```

Scope holds only finite facts, static findings, body/source digests and bounded
request-boundary metadata. The value-free compact observation receipt is also saved:
comment IDs, body digests, syntax metadata and explicit unknown creation remain
inspectable without refetching GitHub. Its digest is a native decision dependency,
not a dangling reference or evidence of complete history. Raw comment bodies, full scopes/footers, check names,
credentials and provider error strings stay outside scope. Failed handoffs retain
an explicit route kind/status/refusal code. Omitted observations are counted.
Those source digests are actual native read dependencies of the decision record;
Foottrace supplies the saved causal slice, with no second causal graph.

GET routes are generated from finite parameters. Redirects are refused; provider
Link URLs are never followed. Pages, requests, streamed bytes, JSON depth/data and
saved file sizes have fixed ceilings; limits may only be lowered. Exact full
pages are probed rather than silently truncated. Response failure or malformed,
changing or partial coverage yields an unknown boundary. Public APIs used:
[issue comments](https://docs.github.com/en/rest/issues/comments#list-issue-comments),
[check runs](https://docs.github.com/en/rest/checks/runs#list-check-runs-for-a-git-reference)
and [pinned contents](https://docs.github.com/en/rest/repos/contents#get-repository-content).

## Deliberate visibility boundary

Current-page REST observations do not establish comment creation-after-head-push,
erased-history absence or continuous edit/delete history. Every comment is
`comment-seen`; no push event is manufactured from current SHA or commit time.
Consequently this adapter reports `verdict-missing` even when today's comment
body matches. There is no caller flag or saved JSON override to promote a snapshot
to proven history. The separate compact receipt model tests ordered creation,
edits, deletion, refusals, new epochs and replay with cooperative fixtures; those
fixtures are not actual GitHub delivery evidence. See [receipt migration and
admission boundaries](eco-readonly-components.md).

A future write reconciler still needs trusted producer/previous-receipt lineage,
continuous history, native profile admission and a fresh effect check, as well as
all existing release guards. This tool does not promise distributed atomicity,
remote convergence, fresh authority on reopening or absence of hidden events.
Local HTTP fixtures and saved test results are labelled as such; they are not live
provider or publishing trials. The entire feature requires its own exact-head
independent source/security/driver and Claude review before merge.
