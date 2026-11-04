**Support** — verify whole-unit source moves from tracked snapshots.

`verifyMove({head, base})` reads tracked snapshots as syntax data and returns
`verification: 'move'`, snapshot IDs, `findings`, `coverage`, identified `moves`,
`ancillaryChanges` and source-reader observations. It never evaluates candidate
code or runs a compiler Program, emitter, plugin, build configuration or service.
Complete coverage means the admitted source grammar was checked, not that a
change passed: findings and coverage are separate. This advisory observation
does not replace normal type, build, behavior or publication checks.

`context`, `units` and `unit-tokens` inventory whole top-level statements.
Multi-variable statements stay indivisible. The key includes complete headers
and bodies, allowing only top-level export/default wrappers and literal import
paths resolving to the same tracked module. `match` pairs units injectively.
Equal-multiplicity ambiguous identities stay incomplete; missing statements,
extra copies, spliced bodies or changed tokens are findings. `order` accepts
multiple intact source runs and retained inert gaps. Reordering is incomplete,
not a finding. Calls, mutable initialization and class execution keep load-order
uncertainty. The finite inert grammar is functions, interfaces, type aliases,
declare forms and constants initialized with literals or functions.

`bindings` compares lexical declaration owners and copied import bindings.
`module`, `exports` and `surface` follow named/default reexports and finite stars
to VALUE/TYPE declaration spaces and canonical paired owners. Existing exported
modules and the union of old/new discovered doors cannot widen or silently point
at another declaration. External kinds, cyclic/ambiguous stars, namespace and
import-equals ownership remain incomplete. `wiring` qualifies new imports by
actual unit uses or an injectively matched move from their former owner; new
unused/opaque wiring is not silently approved as ancillary.

`comments` preserves owned comment bytes and token-relative positions, including
unique trailing ownership. Only explicit citations proven to name the same
paired declaration can change paths. Added file headers and unowned file/wiring
comments are listed separately. `documentation` checks JSDoc root bindings;
moved imported links additionally require an emitted-declaration check because
source imports can be elided. Unsupported lexical/type binding forms stay
incomplete. This checker does not claim declaration-emission equivalence.

`references` reports newly introduced path/owner findings, preserving unchanged
legacy debt identities even inside moved units. Literal readers of files losing
declarations receive a review list and separate source-reader uncertainty; file
existence does not establish reader intent. `ancillary` lists document, baseline
and other asset/metadata changes rather than treating them as equal. Unsupported
metadata semantics and mode changes remain incomplete. Listing a baseline change
does not certify its ratchet; the normal file-size check still owns that law.

All results are JSON data. ASTs, token arrays, lexical caches and matching maps
remain internal. Tests beside each helper exercise the admitted boundaries and
the cases that must remain unknown.
