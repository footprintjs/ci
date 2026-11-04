**Support** — estimate affected tests from two tracked source snapshots.

`affectedTests(head, base)` returns sorted `tests`, `alwaysRun`, `changedPaths`
and reason records, plus `compilerRequired`, `compilerOnly`, `estimate: true`,
coverage and `fullSuiteBeforeMerge: true`. It is an advisory static estimate,
never authority to skip the full pre-merge suite. The API parses syntax only;
it evaluates no candidate code, compiler Program, plugin or project config.

`context` parses each supplied code file once. `changes` compares text plus
object-id/mode metadata, including path-only assets. Tests use the admitted
`.test`/`.spec` code suffixes, including colocated tests; unknown code in test
directories is reported as uncertain discovery. Runner-specific custom patterns
are not evaluated. Deleted tests remain changed evidence, never runnable head
paths. Package/config/helper/setup and executable-mode changes select all known
tests. A missing base does the same.

`modules`, `requests` and `loaders` inventory runtime requests without importing
them. `exports` follows named declarations, renamed reexports, local import
aliases, defaults and finite star exports to actual binding owners. Namespace
imports stay broad. `dependencies` retains the barrel path and its possible
load effects, including transitive registration calls, even when named-owner
narrowing excludes unrelated inert exports. Unknown initialization remains
conservative; constants are inert only for the small literal/function grammar.
Both head and base graphs participate, so deleted paths remain reachable.
Tracked JSON/binary targets propagate through their importer just like source.

`selection` adds filesystem/path/known glob consumers to the always-run set,
including readers reached through helpers, even for erased-type edits. This
is intentionally broader than proving that a particular call reads source.
Unknown dynamic targets, source aliases, cyclic/ambiguous export ownership,
loader aliases, module/VM loader construction and reflection retain reasons
and conservatively select their reachable tests when any path changes.
Unresolved source ownership never becomes a guessed external dependency.

Compiler-only classification needs a finite erased syntax proof in both trees:
interfaces, type aliases and explicit type-only imports/exports. Ambient and
regular/const enums, opaque declarations and other runtime syntax do not gain
that credit. Always-run or uncertain tests keep runtime selection active.
Compiler validation is requested but is not executed by this package.

Internal AST/maps/sets stay inside these modules. Public results contain JSON
data only. Complete coverage means the admitted static cases were resolved;
it is not a whole-program execution theorem or a complete custom-runner model.
This feature changes no workflow, required status, draft policy or merge gate.
