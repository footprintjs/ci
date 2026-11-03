# Propose input components (unfinished)

These components bind prepared inputs. They do not admit release authority,
perform provider writes, or yet form the full native Propose flow.

`runProposePreparation` composes this prepared-input inspection as a native
FootPrint flowchart and `decide()` branch. Scope contains finite facts and a
digest reference plus bounded source/pending/artifact/producer/predecessor
references; each predecessor reference explicitly says published lineage has
not been admitted. Rich preparation stays in the explicitly backend-only return
value. It returns no backend result after a hold or an incomplete native record.
Saved records reuse Foottrace navigation through `explainReleaseRecord`, without
re-executing preparation. This subflow's success is prepared-input knowledge,
and always reports authorized:false and zero library effect writes.

`packageProfile` is a trusted host-code interface. A reviewed package adapter
declares its package name, profile ID, original-parent law, date law, pure
preparer and native historical-evidence reader. It is never constructed from
config JSON, scope, a saved recording or a model response. Function ports are
reviewed code, not user-provided hooks. Descriptor getters are refused.

The evidence reader admits its own actual native artifact and producer format,
then supplies the shared binding, actual artifact digest and prepared data. The
common layer independently reconstructs the immutable original source, raw
queue, declared date, package/lock versions and complete prepared tree. A valid
shaped adapter result cannot replace that reconstruction. The result remains
prepared-input provenance, not permission to act.

The original-parent strategies are `source-only` and `published-predecessor`.
Later pending refreshes always bind ordered parents `[source, prior pending]`,
through at most eight independently bound witnesses. Published predecessor L
stays separate; native published-lineage and source-ancestry admission still
belong to the full flow. The original raw queue must remain an unchanged subset
at every hop, using the existing release preparation helper.

`source-committer-day` derives the deterministic day from immutable source B.
`native-evidence-day` requires an explicitly admitted UTC day from the package's
actual native evidence. Missing invocation-date evidence stays unavailable,
even when a source commit happens to have a plausible date. A profile cannot
silently inherit B's day or override the source-day law with caller data.

Only Foottrace's actual manifest/proposal ZIP adapter is implemented here.
The source-only controls use a synthetic adapter to test the shared interface;
they do not implement or verify the legacy AgentFootprint bundle. Its real
bundle/producer/date/generated-tree admission and thin caller belong to this
OPS/R0 lane after Foottrace1.11 publication. The coordinating lane owns the
separate native runtime and dependency integration. No Foottrace manifest or published-L parent is invented
for that format.

`createRefreshInputReader` reconstructs the successor from source M and its
complete raw queue, retaining pending P and published L separately. Base package
version changes or loss/replacement of an old raw fragment hold. Exact-source
recognition is a fact for the eventual flow decision; it never authorizes a no-op
or metadata repair by itself. Prepared updates remain backend data, outside scope.

Retained-native eligibility, published lineage/current-main/source ancestry,
FlowChart stages/decisions, verify-first partial effects, mutations, complete
checks and independent exact-head source reviews remain required before use.

The Foottrace-specific `createFoottraceAncestryReader` now reuses the exact pinned
native current-main and complete bounded compare guards, through a fixed GET-only
adapter. It checks the referenced predecessor merge to original source, each
pending source hop, then source M, with adjacent current-main reads. Compact
attempted-read/projection-digest observations remain even on failure; raw provider
bodies and error text are omitted. It admits source relationships only, explicitly
leaving published lineage, repository identity, producer/eligibility and authority
unadmitted. The surrounding Propose flow must still bind these proofs to fresh
native sources. No guard snapshot is modified and no AF ancestry implementation
or provider continuity is inferred from this Foottrace adapter.

`createFoottraceLineageReader` separately reuses the exact pinned native
`sourceInput` and `publicationState` guards for current source, registry bytes,
tag/release/marker/package and discovered linked lineage. A narrow join also
requires the caller's exact retained PR/head/tree/merge, and current main is read
on both sides. Pending or conflicting publication data holds. This proves only
data lineage within the native cooperative profile. Private App identity,
cryptographic provenance authentication, fresh producer/User authority, pending
eligibility and effects remain unadmitted. Tests use synthetic native provider
fixtures; they do not reverify the completed live1.10 release. No historical
target helper code is executed and none of the pinned native snapshots changes.

`runProposeInspection` joins prepared inputs, an exact published-predecessor
binding and the complete source-edge binding in one native FootPrint flowchart.
Every stage transition is a recorded `decide()` branch; unavailable lineage
prevents the ancestry reader from running. The trusted host supplies the reviewed
package readers through code ports. Their rich returns and exception text are
never copied into tracked state. Scope keeps bounded preparation refs, stage
facts and digest refs of the owned joined bindings. Saved `proposeResult` evidence
can be explained without repeating external reads. A record-budget failure
returns no backend result. This is read-only inspection knowledge, explicitly
leaving retained eligibility, fresh current-run/App/User identity, reservations
and permission to act unadmitted. The tests compose the actual pinned native
ancestry adapter with a synthetic lineage port; they are not an actual end-to-end
provider eligibility proof or the complete effectful Propose flow.

`createFoottracePendingReader` reads only the current associated-PR set, public
bot/repository identity, pending ref/head/tree/ordered parents and adjacent state.
It reuses the unchanged native complete-page and current-main guards through a
fixed GET-only boundary (8 pages, 32 admitted acquisitions). Attempted boundaries
and admitted projection digests are retained without raw bodies/errors. LIST's
missing merged Boolean stays null; DETAIL must explicitly say unmerged. A moved
PR/main/ref, competing open PR, substituted parent/head, auto-merge or incomplete
listing holds. Closed historical rows are current-reference metadata only.
This adapter explicitly does not admit private App/current-run identity, reviews,
grants/reservations/publication attempts, erased history or retained eligibility;
those separate stages must complete before any effect. Its controls are synthetic
provider calls with actual pinned native guard code, not live state verification.

The pending reference reports the PR's `observedBase` separately from current
main and immutable preparation sources. GitHub may retain an older PR base tip;
it is not evidence of either original B or current M. Same-repository/main-ref
identity and adjacent unchanged PR snapshots still hold. Preparation witnesses
and the separate ancestry reader own the source relationships. Accepting this
snapshot field never admits eligibility or permission to act.

`createFoottraceReviewReader` reuses the current pending-reference reader and the
unchanged complete native page guard. It admits at most 256 review rows, 64 User
reviewers and 224 GET attempts; current permissions and complete review sets are
compared on both sides, with fresh pending/main/ref snapshots. Review IDs order
APPROVED / CHANGES_REQUESTED / DISMISSED as in the native authority rule; comments
do not erase objections. An effective approval on P, an unresolved objection or
a pending draft review holds refresh. A prior-head approval review stays counted
as a retained occurrence, never approval of P. Unknown or changed observations hold.
Bot approvals also hold under the refresh rule and never become native User authority.
No username, body, profile or private error is returned; only owned identifiers,
counts, finite reasons, attempted boundaries and projection digests remain. The
trusted host still owns byte/time limits before acquisition; this adapter does
not claim to sandbox a hostile transport.

The native inspection flow now joins this review evidence after ancestry, through
recorded decide() stages. The saved result names a finite review hold cause and
can be reopened through the existing Foottrace tools without repeating reads.
This is still read-only knowledge, not complete retained workflow/grant/reservation/
submission eligibility or current private App/producer/User authority. Those stages
and all effect rechecks remain mandatory. The default package dependencies still
use the existing native10 development runtime; this is not a native11 consumer claim.

The shared `createRetainedWorkflowReader` consumes an explicit reviewed host-code
workflow profile and the same unchanged native complete-page guard. It collects
every retained run and every numbered attempt, jobs and run-linked artifact
metadata, then compares a second complete adjacent collection. Fixed bounds are
64 runs, eight attempts each, 32 jobs per attempt, 512 jobs and 128 artifacts in
each collection, 64 artifacts per run, and 4096 total GET boundaries. Duplicate
job/artifact identities, mismatched source/repository/attempts, incomplete pages,
unknown profile vocabulary and changed collections hold. Artifact metadata is
run-linked only: it never invents an API attempt field or proves artifact bytes.

Nonterminal work and every non-skipped authority/release/publish stage remain
explicit observations. Source/version classification, native release assets and
registry conflict admission, grants/reservations/submission eligibility and fresh
current-run/private App authority remain separate and mandatory. A complete or
empty retained workflow collection never establishes permission, erased history
or provider continuity. The native inspection flow saves owned counts, digest
references and a finite hold reason through recorded decide() stages; raw jobs,
provider bodies and error text do not enter the recording. Its backend workflow
binding carries counts only, not a new authorization or publication ledger.

The shared candidate-publication reader retains every admitted pending witness
version separately from the newly prepared target, rather than dropping an older
candidate after a refresh. Native marker/tag naming laws are explicit trusted
profile data. Complete release/asset collections, optional tag reads and the
reviewed native registry adapter are compared twice. A marker on any release,
candidate tag/release or registry entry holds; an observed conflict stays in the
failed backend evidence even if later reads fail or the conflict disappears.
HTTP errors and malformed returned bodies never become absence observations.

The fixed candidate bounds are eight pending witnesses plus the new target,
256 releases, 512 assets, eight pages per list and 2048 GET boundaries, with the
host/native adapter owning byte/time limits before acquisition. The Foottrace
adapter reuses unchanged registryVersion HTTP/package/size admission and only
reads the candidate versions: it does not reverify the published predecessor's
archive/latest terminal release. Native inspection saves the finite candidate
hold reason and joined owned evidence counts/digest through decide() branches.
Registry absence is explicitly only an at-read fact, never erased-history or
provider-continuity proof. Retained run source/version classification, complete
grant/submission eligibility, fresh App/current-run authority, final rechecks and
effects remain mandatory; this reader alone cannot authorize refresh/publication.

The shared retained-source-version reader binds every retained workflow source
to its package.json through an immutable Contents-at-commit API route, verified
Git blob SHA/size and fatal UTF8 admission. It reuses the existing pure blob and
decoding helpers, executes no historical code, and admits only package name and
numeric version plus source/blob/hash references. Fixed limits are 64 distinct
source acquisitions, 128 KiB decoded/180 KiB base64 text per package, 64 runs,
eight attempts per run, 512 attempts/jobs and 32 jobs per attempt. Host transport
byte/time limits must precede acquisition. The path binding is the cooperative
provider Contents API, not an independent Git Merkle-path proof.

Every retained attempt must be present exactly once with nonempty complete job
observations. Candidate source authority/release/publish activity holds as
candidate effect/submission uncertainty even if registry and markers are absent.
Other source versions remain classified data; they confer no authority. All
nonterminal attempts remain explicit and are never exempted by a fabricated
current producer. The surrounding native flow joins this result's exact prior
workflow digest, all collected source identities, candidate set and owned
source/package/blob references, through another decide() stage. Fresh current
native producer/private App authority, retained preparation-witness links and
complete eligibility/effect rechecks remain required before any write.

The shared retained-witness reader joins every decoded preparation witness back
to the complete native run/attempt/prepare-job/artifact observations, then reads
the actual immutable source and prepared-head commits and downloads that exact
artifact ID. Actual source/pending trees, ordered parents, the declared source-day
law and ZIP bytes/hash/size must match the independently reconstructed witness.
No API artifact attempt field is invented: the attempt link comes from the
already decoded witness plus real prepare-job and archive identity. Naming,
job/event and parent/date laws are explicit reviewed package-profile data.

The fixed limits are eight witnesses,24GET boundaries,20MiBperZIP and64MiBtotal
downloaded artifact bytes; transport bounds precede acquisition. The actual
existing ZIP/manifest/proposal admission and complete pure tree reconstruction
remain in the package evidence adapter. This join executes no historical code,
stores no raw ZIP/signedURL/provider body/error in scope and leaves fresh
private App/current producer/retained eligibility/effects unadmitted. Native
inspection joins the exact preceding workflow digest and every source/date/
producer/archive reference through a recorded decide() stage before later reads.

Current proposer identity uses an opaque runtime-only transport constructed over
the native makeApi repository adapter and one bounded App identity read. The
App metadata request uses a preissued short-lived JWT only for GET /app;
repository calls retain their separately scoped installation token.
No saved object, scope or JSON config can substitute that adapter. Secrets remain
in the native API closure and never enter observations, errors or recordings.
Every request is GET-only, redirect:error, at most2MiB per response/8MiB total/
128requests per adapter; declared and streamed byte bounds precede native JSON
admission, preserving the actual content-type instead of relabelling bodies.

The reader reuses unchanged producerIdentity for the real current running run and
successful prepare job, separately requiring the proposal job to be in progress.
It compares two complete current identity observations and binds main/source tree,
private App settings, public Bot and exact run/attempt/job IDs. The native flow
also joins that Bot to the actual pending PR Bot. Completed historical producers
stay refused with their native reason recorded. These are identity observations:
writer credential-to-job handoff, complete eligibility and all write/publication
permissions remain unadmitted. No real App credential/account or live HTTP call
is used by the synthetic fixture corpus.

The Foottrace current-preparation reader reuses unchanged native readArtifact and running producer guards, and independently joins the entire actual proposal JSON to reconstructed preparation. Both actual ZIP acquisitions must match their declared size, optional provider digest, exact current run/attempt/prepare-job manifest, source tree and proposal bytes. Private App/current producer identity is checked before and after each acquisition; coherent adjacent archive drift holds. The native inspection records current archive references and finite native refusal causes via decide(). No raw ZIP, manifest, proposal or private body enters scope. The reviewed host GET port must bound bytes/time BEFORE acquisition; this layer bounds admitted ZIPs to20MiB each/two40MiB total/24 boundaries. No claim of a finished HTTP archive-download driver, ordinary/recovery-kind admission, writer token/job binding or full eligibility follows from this stage.

The Foottrace ordinary preparation adapter now acquires each pending witness source and current M through the unchanged native sourceView/sourceInput Git/blob reader, then reconstructs every target with the pinned native pure preparer. It joins full source/target trees, source-day, base/target versions, raw-queue subset across all hops and the entire current proposal payload. Structurally valid active recovery intents hold this ordinary path; admitted old-version intents remain historical data. Two acquisitions use a new native view per phase, adjacent main checks, at most eight witness sources plus M and4096 total GET boundaries; unchanged native4096-entry/2MiB-blob/128MiB-phase limits apply. The host still owns pre-acquisition byte/time limits. Native inspection records kind/source/queue/preparation digest refs via decide(), preserving earlier evidence and finite refusal causes without raw inventories, fragments or provider bodies. Pure evidence joins are separated in inspection-bindings.mjs from native flow orchestration. This admits ordinary source knowledge only; retained eligibility, writer handoff, effects and the AF native adapter remain required.

The shared retained-attempt assessor classifies actual native run/attempt/job/artifact and immutable source-version observations against an explicitly supplied reviewed native role/naming profile. All retained attempts other than the exact freshly bound current invocation must be terminal. The current run/attempt/source/prepare+proposal jobs/archive must join the separately admitted identity and preparation. Required current prelude jobs must succeed; its proposal job must still run. Future jobs may be skipped or queued only inside that same invocation; started, waiting, completed non-skipped stages hold. No historical status is rewritten. This current-invocation distinction is a cooperative profile claim requiring full independent source/driver review, not a self-issued write grant. Older base-or-newer-source authority/release/publish activity holds as possible candidate submission; the exact separately published predecessor remains distinct. Raw job states are assessed rather than trusting nonterminal summaries. Every numbered attempt and current artifact identity/expiry/size/name must be accounted for. Literal versus producer-cohort artifact names are declared strategies, not an implemented AF adapter.

Native inspection now records this classification and finite hold causes with decide(). Its original read-only input-knowledge status remains separate: an inspection-only result can carry retainedAttemptsEligible:false; a full Propose caller must refuse effects in that case. Missing retainedProfile always yields an unavailable assessment, with no package default. Even a true retainedAttemptsEligible admits only this finite attempt classification; report.eligibilityAdmitted, authority and all effect counts remain false/zero. Review/refusal, candidate conflict, complete native eligibility and current writer handoff still belong to the surrounding effectful flow. No Eco continuity, erased-history proof or ledger seed is created.

The concrete shared GitHub GET transport now enforces repository/API routes, GET/no-body, bounded URL parsing, response headers/streams, per-view and shared quotas, and shared cancellation. The native Foottrace adapter reuses unchanged makeApi/App JWT signing and exposes only an opaque runtime read client. Current identity gets a fresh128-request/8MiB view per acquisition; shared4096-fetch/128MiB admitted-byte limits cannot be reset by making another view. JSON responses are capped at2MiB, exact immutable Git blob envelopes at4MiB, preparation ZIPs at20MiB. Limits are explicit source policy, not unlimited response or absolute socket/heap guarantees for a caller-supplied fetcher. Facts count fetch invocations and admitted decoded stream bytes, not proven server deliveries or compressed wire bytes.

Only an artifact ZIP API route may accept one302 to an HTTPS Azure blob subdomain or exact results-receiver.actions.githubusercontent.com. The anonymous request carries fresh accept-only headers, credentials:omit, no cookie/token/App JWT/API headers, and the same bounded signal; another redirect is refused. Signed locations, headers, bodies and errors never enter facts. All native archive/manifest/whole-proposal admission still follows these bytes. Other API/App redirects are refused. These endpoint facts were checked against [GitHub artifact REST documentation](https://docs.github.com/en/rest/actions/artifacts#download-an-artifact) and [runner artifact communication requirements](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#communication-requirements-for-github-hosted-runners); the host restriction is this library's conservative policy, not a guarantee that every future GitHub redirect host is supported.

Migration (unshipped source API): createFoottraceProposerTransport is removed. Trusted callers import createFoottraceTransport from foottrace-transport.mjs and supply the pinned repository along with their existing native App inputs. There is no alias or alternate credential route. foottraceTransportPort is a code-only lookup for bounded GET functions and public counters, never a writer capability. No actual key file/service was accessed in this implementation proof; tests use synthetic unregistered in-memory keys and responses. Writer-token/job handoff, full effectful eligibility/facade, nonforce effects, AF adapter and reviewed cutovers remain outstanding.


Pending discovery uses complete bounded native workflow metadata and actual immutable B/P source inventories plus numbered-attempt/job/artifact ZIP reads. Exactly one potential native cohort is required before full prepared-input reconstruction; multiple possible cohorts conservatively HOLD without claiming metadata proves coherence. At most eight [B,L] then [M,P] witnesses are returned oldest-first; L remains separately admitted. Failed/running same-B invocations retaining preparation bytes HOLD rather than disappear as nonmatches. Legacy duplicate exact-noop cohorts and successful prepare in failed whole runs remain explicit continuation contract questions; no current-run authority is relaxed. discovery-flow.mjs records this read-only knowledge through native decide(), compact references only. A complete facade must fresh-join/recheck collection/lineage/current authority and writer handoff before effects; these readers grant none. New source is not yet wired into the public bundle or an effectful R0 caller.


The single Foottrace pending observer discovers current public PR/ref/head/tree/parents independently of prepared witnesses. The existing prepared pending reader now joins that same observer to reconstructed source/head/tree/parent references; it still refuses all substituted prepared identities. This removes the pending-bootstrap cycle without a second public-reference engine or relaxing prepared-input checks. Public observation alone is not preparation, published lineage, private App or effect authority. Native published-lineage and registry discovery now compose in the production read-only facade below; writer and effectful admission remain separate.


Native L bootstrap now discovers published lineage with the same pinned publicationState/source guards. Its second associated-PR read must match the exact owned PR/head/merge detail consumed during native admission; equal trees cannot replace that identity. The existing prepared lineage reader joins the same observer, with no duplicate publication engine. Migration: trusted lineage transport now supplies registry(version) returning the exact-version anonymous GET function, rather than an unrestricted fetcher. The opaque Foottrace transport provides this factory from the shared HTTP budget; API and registry share request/stream/abort accounting. Registry admits only explicit package/version, same-package latest and exact tarball URLs, with no caller headers/credentials/redirects, JSON2MiB/tarball16MiB limits. Real-shaped native HTTP controls use synthetic keys/providers only, not terminal publication polling or Sigstore verification. Full facade/current writer/effect authority remains separate.


The production read-only entry runFoottraceProposeInspection accepts only an
opaque native transport, a fully admitted actual invocation context and the
current preparation artifact ID. No saved witness, lineage/history or callback
is accepted. Its native bootstrap discovers actual published L, pending P,
the unique original B preparation/archive and current M. The existing inspection
recipe extends that same chart, with unique branch IDs and one executor/record.
Only compact owned facts enter tracked state; source bytes stay backend-local.

The bootstrap rechecks the pending observation before issuing another workflow
read. Inspection then requires its complete workflow collection to match the
discovery collection. Actual current private App/producer identity is acquired
again before the current archive join; the compact prior binding is compared
with the fresh real native observation, never given fabricated admission flags.
The current archive reader retains its own adjacent identity checks.
Invalid full invocation facts stop before discovery HTTP reads. Backend results
are discarded when the single final native record is incomplete.

This remains input inspection: finite retained-attempt classification is reported
separately, full eligibility and writer authority remain false, and no effects
are implemented. The actual offline whole-world fixture binds the published
predecessor to its distinct terminal publisher, the pending preparation to its
own completed invocation and M to its real-shaped running invocation. Synthetic
keys/providers are unregistered; these tests establish no live authority.

The proposed saved-outcome admission subsystem was dropped following independent
design review. Ordinary native records remain diagnostic evidence. Any future
same-tree metadata reconciliation must use the separately reviewed observed-state
design and all current native authority/history guards; no saved record is a grant.


The shared observed-app-commit reader implements the approved provider-state
input boundary. It uses the repository commits endpoint's resolved author and
committer, requiring exact configured Bot numeric IDs/login/type and
verification.verified === true with reason === valid. Raw Git display names
cannot substitute. Exact response SHA/tree/ordered parents join the separately
observed native reference. The actual current private App/producer identity is
reacquired before and after each of two commit observations. Only owned compact
references survive; signatures, payloads, messages and private fields do not.
The sameTargetTree fact is explicitly separate from original-creator attribution,
current writer provenance and effect eligibility.

observed-commit-flow.mjs records that knowledge with native decide() and one
record, independently checks the code-port result, and supports JSON/Foottrace
reopening. Incomplete capture discards its backend. This is a component for the
future metadata branch; the complete production effectful Propose path is still
unfinished. Tests use real-shaped native offline source/current identity plus
deliberately modelled existing signed-ref observations. They do not prove that
the real pinned writer produces signed provider actors.

Credential handling now treats existing tokens as opaque, bounded visible ASCII
header values; it does not parse an App token or infer authority from its format.
One shared validator serves the native read adapter, shadow and eco. The
dependency-free pre-checkout caller embeds the same function; the ordinary build
requires its source to match, and existing workflow tests require the full
preflight embed to match. No header/redirect/registry credential confinement
changes. The ordinary CLI bundle changed for this credential fix; Propose still
has no public effectful bundle wiring. GitHub documents a [stateless installation
token format](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)
and advises [opaque credential handling](https://github.blog/changelog/2026-10-02-stateless-github-app-installation-tokens-rolled-out/).
No token/key was read, minted or changed by this proof.

The approved design correction C1 distinguishes exact computed PR title/body
PATCH from other effects: a lost response is GET-verified with no retry inside
that invocation; stale metadata holds that invocation, while a later fully
eligible fresh invocation may one identical PATCH. Uncertain create-PR,
create-commit, ref movement and publication remain verify-only/HOLD across
invocations. No new saved-outcome admission or journal is introduced. The actual
writer handoff/full native eligibility, this metadata effect, nonforce refresh,
thin Foottrace bridge and real AF/R0 adapter remain separate implementation work.


runFoottraceMetadataInputInspection is now the production read-only current-only
metadata input path. It reconstructs actual ordinary M using the SAME generic
prepared-source engine and explicit package/date profile, joins the actual
current private App/producer and complete current prepare archive, discovers
published L and the single pending P, and extends the SAME native chart with the
resolved signed App commit stage. No historical run or creator is selected.

The immediate Git parent source B is separately reconstructed from actual native
source data. Its whole prepared target must equal P/current target, its raw queue
must remain an unchanged subset at M, and native ancestry proves L.merge→B→M.
B may equal M or be a real older source. This is data provenance, with no original
producer attribution or permission to refresh a ref; the separate eight-hop
witness path still holds ambiguous historical creators. A semantically equivalent
raw fragment edit remains a hold even when normalization leaves the target tree
unchanged. Active recovery remains outside the ordinary current-only path.

After signed commit acquisition, the actual pending observation is reacquired
and compared again; a moved ref cannot remain current input knowledge.
Different targets stop before signed-state acquisition. Invalid contexts or
artifact IDs stop before discovery. One final incomplete native record discards
all rich backend data. Records keep compact references and finite reasons only.
Source-parent data is now observed, but full effect predicates/history,
writer provenance and authority remain false/unadmitted; this component performs
no PATCH or ref write and supplies no saved continuation grant.

Migration (unshipped code-only stage API): observed-commit-flow takes a trusted
readInputs() backend getter and optional native start builder. Static prepared/
pending/current stage arguments are removed; there is no alias or fallback.
This lets the final Propose recipe extend one chart after actual discovery,
rather than execute disconnected source and observed-state graphs.

Current-reference review observations now reuse the SAME bounded native review
engine as the prepared ref-refresh path. The metadata path joins an independently
observed exact P/reference; it does not invent preparationRefs or select an old
creator. The prepared path retains its full eight-hop input join. Both preserve
256-review/64-User/fixed request caps, complete pages, effective native-ID review
ordering, current-head approvals, unresolved refusals, pending reviews and two
adjacent User-permission observations. Review bodies and private errors never
enter the record. This is current snapshot knowledge, not erased-history proof.

The single metadata chart records the review decision before resolved signing
reads, then re-acquires reviews/permissions and P after those reads. A changed
fingerprint or refusal holds even when the signed tree still matches. Review
knowledge admits no full retained workflow, reservation, submission or writer
authority. The exact C1 metadata effect and actual source/job/client handoff
remain unfinished; native records remain diagnostic.

The current-only metadata history facade now extends that SAME native chart with
actual retained workflow, numbered-attempt/job/artifact, immutable source package
and current candidate observations. The existing shared readers and finite
attempt classifier are reused. An explicitly observed, complete terminal native
history can yield snapshot knowledge; missing/failed historical proposals,
nonterminal attempts, other publication activity, reservations, malformed source
bytes and drift hold. A fresh complete workflow acquisition and signed/current
reference/review recheck finish the observation. Registry404 still means absence
only at that read. No erased-history, continuity, writer or effect grant follows.

The publication exemption now binds the exact run AND attempt in the marker
actually consumed by unchanged native publicationState. Matching the published
source SHA alone is insufficient: another run or later attempt on that source
retains its own uncertainty. Marker producer data is cooperative native evidence,
not independent Sigstore/OIDC verification or a historical preparation creator.

Migration (unshipped private reader API): candidateVersions and the candidate
publication/source-version reader constructors require an explicit candidate
scope, pending-chain or current-target. The current strategy requires actual
current prepared input and rejects a fabricated preparationRefs chain. The
pending strategy still requires its bounded chain; no inference or fallback.
The retained-attempt classifier now requires explicit published lineage,
including its version/tree/archive digest and marker producer. Prepared input
alone cannot supply or invent that proof. Native preparation-only historical
collections remain useful INPUT data but no longer count as eligible effect
history. Whole-module source review and actual writer/C1 effects remain pending.

The exact metadata reader now observes title/body only through the SAME native
pending-reference reads, joins the independently bound reference before and
after, and requires all four actual PR detail snapshots to agree. It compares
exact bytes against a trusted computed payload; it neither normalizes whitespace
nor supplies that payload's source admission. Public null PR body denotes the
empty body value. Fixed UTF8 limits are256bytes title and64KiB body, with a128KiB
JSON budget. Only digests, match facts and compact reference data return; provider
or desired bodies and private errors stay outside scope and receipts.

The explicit C1 effect table classifies only exact PR metadata as idempotent:
uncertainty is GET-verify only within an invocation, and a later fully fresh
eligible invocation may set that same value once. All other listed proposal and
publication effects retain GET-only uncertainty across invocations. Unknown
effects have no fallback. This is immutable policy DATA, not a writer grant,
submission retry implementation or completed C1 effect flow. Actual writer
source/client admission and native capture-before-effect remain pending.

Current proposal bootstrap observation now captures the supplied Actions aliases
and one opaque read-only credential owner, rejects any private-key input, then
removes APP_JWT/GH_TOKEN and defensively clears APP_PRIVATE_KEY before host I/O
or provider acquisition. Platform source/workflow
SHA and repository/run/attempt/ref/event/job must agree. The declared tool pin
in the environment and CODE profile must agree; actual executing-tool identity
and trusted bridge wiring still require independent admission.
Credentials never enter returned data or the native record. Changing the caller
environment later cannot replace the captured client; this does not authenticate
a hostile process or its environment.

Trusted CODE host ports read the independent profile, current local source and
cleanliness. They are not saved/model callbacks or PROFILE_JSON. The actual
immutable native M/tree/inventory, workflow/entry/profile path/mode/blob/bytes and
SHA256 values must match those local CODE facts through adjacent source reads.
No target source is imported or executed. The same sealed GET client then reads
the private configured App/current producer and rechecks source plus identity.

This is a native recorded bootstrap INPUT prefix. Its profile-code authority,
writer credential admission and all effect authority remain FALSE. A supplied
CODE profile matching bytes does not substitute for the missing independently
reviewed physical thin bridge/source/job-to-App-output root. That actual bridge,
least-privilege per-step workflow wiring/Git-child sanitization, current archive/full
eligibility and a distinct bounded writer facet still need implementation and
full independent source review. Read-only facets are never widened into writers.

Local host headers reject data accessors, and all three local file buffers are
owned before provider awaits. A later mutation of the supplied host object or
buffer cannot retarget an earlier observation. Cleanliness and identity/source
are rechecked, but adjacent snapshots do not prove uninterrupted continuity.

The input bootstrap is also emitted as dist/propose.cjs, with its own exact metadata and Node-only runtime imports. It is a read-only native observation bundle; a target control needs no dependency install. It does not expose a writer or complete Propose API.


The source-only metadata bootstrap composes the existing captured entry/host
prefix and current metadata history in one native executor, using the same
opaque runtime owner. Actual completed native result rows and the native commit
count are observed before crossing each input boundary. Current preparation,
local/native host source and private running identity are reobserved after the
history prefix. A failed root stops dependent acquisition; incomplete capture
discards all private joined input. A factory refuses replay before provider I/O.
Public inspection DATA cannot supply an executor, predecessor chart or completed
flag. Only trusted source CODE can compose a predecessor builder.

These observations remain input knowledge. They do not select a writer,
authenticate an arbitrary process, establish exact historical creator or
continuous history, admit a reservation/grant, or implement the accepted C1
terminal design/T1 business-outcome gates. Native records remain diagnostic.
The committed inspection program continues to export only its existing
read-only facade; this richer joined source entry is not adopted by a caller.


The closed exact-metadata HTTP facet exposes a bounded, ephemeral attempt
observation for its own invocation. It starts unattempted, becomes in-flight only
after request admission, and distinguishes bounded HTTP200 bytes from narrow
submission uncertainty, explicit rejection and technical failure. This does not
say the payload parsed, the PR matches, or reconciliation succeeded. No error
message, body, token or cause is emitted. Only selected HTTP408/500/502/503/504,
a recognized own-data native fetch failure shape, or the actual interrupted
request's recognized abort/timeout reason count as uncertainty. Unexpected
exceptions, authorization rejection, invalid MIME/response or budget failure
remain technical failures. Classification is attached to the actual fetch
boundary; a network-shaped exception during response processing is not enough.

An uncertain result still consumes the same owner's one PATCH attempt. Native
GET verification stays on that owner where its budget permits. Another facet
cannot repeat it, and the observation is not saved authority. The full native
eligibility/recheck controller, exact GET comparison, C1 terminal mapping and
T1 visible/business-outcome/downstream gates remain separately required.


Migration (unshipped shared transport API): both native profiles require a
preissued short-lived App identity JWT in appIdentity.jwt; privateKey input is
removed and rejected. The protected caller signs it in an isolated step. The
inspection profile receives a separately minted repository-scoped read token
and cannot derive the exact PATCH facet. The writer-capable IO profile is
separate and still requires actual native writer eligibility before any effect.

GET /app uses only the short-lived JWT through one bounded identity adapter;
repository requests use only their installation token. Both route through the
same request/byte/cancellation bank. A JWT remains an App-level credential and
can authenticate sensitive App endpoints if stolen. This is cooperative exact
CODE routing plus limited lifetime, not a claim that the JWT itself is scoped
read-only. No key, raw credential or JWT is recorded. Wrong configured App/client
identity and unknown or failed reads remain HOLD. A read-only repository may be
observed without a push grant; the writer profile's push predicate stays strict.

The final current-only history observation now reacquires every earlier native
input on the same captured client: deterministic current source, running private
producer, exact preparation archive, published lineage and immediate parent
source/raw queue. It then reacquires source versions, reclassifies the retained
attempts and rereads current candidate reservations/publication before the
signed-reference/review and exact metadata checks. Drift discards input knowledge;
a signature or earlier complete history is never a substitute for these fresh
reads. This is read-only preparation for the C1 controller, not its completed
pre-effect stage, writer admission, T1 terminal or permission to PATCH.

The private closed-controller source can now capture a distinct writer
invocation through a CODE-selected entry. It reuses the same strict Actions
alias/run/attempt/job/ref/source and artifact validation as the public read-only
capture. It never widens a captured read owner or accepts a caller-selected
constructor. Both paths capture their token/JWT once and remove credential
fields before host/provider I/O; neither accepts a private key. The writer
profile still requires native push permission and a genuinely running producer.
This is source/client capture only: exact reviewed workflow/action-output
handoff, profile authority, all effect eligibility and the C1/T1 controller
remain unadmitted. The public inspection program still chooses read-only.
