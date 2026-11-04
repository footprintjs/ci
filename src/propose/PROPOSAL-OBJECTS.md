# Proposal object GET observations

This internal adapter verifies observed Git objects after a native proposal
submission or during GET-only investigation. It performs no mutation and emits
no native grant. Object presence never proves our submission, exact original
producer, current writer permission, an acknowledged result or retry safety.

The native source reader and object observations now use one bounded Git
decoder in git-source.cjs. Source admission still follows the same cached
commit/inventory path and finite semantic-byte list. Native blob content keeps
the existing two-MiB bound, size/base64/OID checks and 128-MiB aggregate limit.
Complete tree observations reject truncation, duplicates and unsupported modes,
and recompute the whole Git tree OID. This extraction shrinks the existing
oversized release-github guard; it does not raise a baseline.

Blob observations bind exact UTF8 bytes and use two fresh native GET views.
Tree observations read the exact reconstructed target tree twice and retain
only its OID, entry count and inventory digest. Raw content and paths stay in
the backend. Acquisition failure or inconsistent bytes produce unavailable
observation data; an owning effect controller must treat it as technical
failure, not a successful metadata HOLD.

The configured-App commit decoder is shared with the existing same-tree
metadata observation. It requires provider-resolved Bot author AND committer
with the exact stable ID and login, verified === true, reason === valid, the
exact target tree and the ordered parents. Display names/emails, commit
messages, raw signatures and signed payloads are neither accepted as identity
nor returned.

For a new refresh commit, the expected parents are exactly current M and
pending P from reconstructed inputs. The current running producer is read
through the SAME captured owner immediately before and after EACH REST commit
GET. Two adjacent observations must match. No fake pending PR/reference facts
are constructed for a commit that has not moved the branch yet. Start-of-job
App facts remain start observations; they do not become a fresh private-App
grant or historical writer attribution.

The direct HTTP owner now halts every later mutation view after any submitted
request whose outcome is not returned: known rejection, technical failure or
narrow uncertainty. The native API wrapper already stopped rejected requests;
the underlying view now enforces that invariant itself across mutation kinds.
GET verification stays available within its existing request/byte bank. A
refused request shape before submission does not consume a valid future attempt.

The full owning Propose flow must still require all native eligibility,
effective reviews/refusals, grants, retained history, reservations/submission
handling, actual completed pre-effect stages and immediate rechecks before
every effect. These object observations are INPUT facts only. Non-idempotent
uncertainty remains GET-only/HOLD across invocations; exact metadata C1 retains
its separately reviewed idempotent retry law. There is no saved authority,
journal, creator inference or physical workflow adoption here.

Current source and compiled artifacts are separate: after this extraction the
compiled programs have not been rebuilt or gated. Their old bytes are not
evidence for the changed source. A new coordinated heavy window and complete
current source/package/release/hosted gates precede full exact staff/Claude
review and adoption.
