**Support** — runtime source-module edges and folder structure observations.

Only tracked production source forms the runtime graph; tests and declaration
files are excluded. Type-only imports do not create edges. Eager closure includes
static ESM imports/reexports and admitted unconditional synchronous requires;
potential closure also includes deferred literal import/require edges. Neither
is an execution trace. External/data boundaries and unresolved
patterns remain visible. Folder pairs use the common ancestor at every depth.
Bare specifiers need a declared package boundary (or node:); unsupported source
aliases remain unverified and are not counted as proven distinct module targets.
Consequently an incomplete direct-import count is a lower bound, not compliance.
