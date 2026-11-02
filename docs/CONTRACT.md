# v1 contract and rollout boundary

This implementation is the first read-only cut of the accepted seven-stage release design. It does not replace any existing publisher.

| Layer | Responsibility |
|---|---|
| Fixed configuration | Approved Foottrace repository/package/App/workflow identities and mandatory gates; no hooks, arbitrary endpoints or approval bypasses |
| Native FootPrint graph | Seven function stages and decisions; fresh scope, tracked public results and actual branches; no restored authorization |
| Native Foottrace guards | Existing planning/source/history, identity, artifact, reservation, grant and verification decisions |
| Read-only collector | Fixed bounded GitHub/npm GETs; opaque checks return a small public receipt |
| Saved evidence | Snapshot, build structure and control recorder; bounded native causal slices; records never authorize an effect |
| Bundle/workflow | Independent pinned tool runtime, no candidate code or target dependency installation; read-only permissions |

`runReleaseFlow` accepts only branded validated configuration, shadow/control context and explicitly read-only ports. This is an in-process programming contract, not a sandbox for arbitrary untrusted JavaScript plugins. The production CLI binds only the fixed built-in collector. Inputs with unknown configuration fields, live mode, arbitrary profiles, write methods or unsafe routes refuse.

The uniform review adapter consumes verified witness data; it is not a live review collector. Missing security/review evidence refuses. A future live collector must freshly bind the witness, permissions, App identity and artifacts at the effect boundary. A supplied recording or public comment alone is insufficient.

The committed bundle boots even when a candidate has broken/uninstallable dependencies. Build reproducibility is checked against the lockfile and committed dist. Runtime/control never imports target modules or runs target config hooks. The vendored npm payload is reserved for a future publisher implementation and is not a live capability.

Native scope contains only a bounded projection of public facts. Full source trees, archives and provider responses stay in the collector. Thus the record explains stage inputs/outcomes and decisions, not every internal helper operation. `complete` means the native observation was saved in full; a business refusal can still have a complete record and a failed native boundary. Persistence/upload success is a separate fact; an interrupted run cannot manufacture completeness.

Uncertain or reserved submissions remain verify-only, even when npm answers 404. Existing markers/history are cooperative evidence, not distributed compare-and-swap. No exactly-once guarantee or reconstruction of erased history is claimed. Current source fixtures preserve this behavior; shadow never reserves/submits.

Before a live cutover: review exact caller/tool pins and current base; collect real App and OIDC bindings; isolate preparation/build from credentials and publisher; pass all package and consumer gates; validate the exact archive and producer; recheck authority and reserve durably; permit only the single admitted archive submission; verify registry bytes and independent provenance coverage. Each repository migration needs independent review and owner approval. A rollback is a reviewed pin change preserving history, not a republish or ref rewind.

The broader ecosystem checker and version-set promotion will share this package only after their combined design is agreed. No second history graph is introduced here, and no v2 behavior is implied by v1 tests.
