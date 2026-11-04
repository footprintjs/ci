**Support** — estimate affected tests from two tracked source snapshots.

`affectedTests(head, base)` leads with `selection`: selected/known counts and
unique selected-test counts per reason kind (kinds may overlap). It returns
sorted `tests`, `alwaysRun`, `changedPaths`
and reason records, plus `compilerRequired`, `compilerOnly`, `estimate: true`,
coverage and `fullSuiteBeforeMerge: true`. It is an advisory static estimate,
never authority to skip the full pre-merge suite. The API parses syntax only;
it evaluates no candidate code, compiler Program, plugin or project config.

`context` parses each supplied code file once. `changes` compares text plus
object-id/mode metadata, including path-only assets. Tests use the admitted
literal default Vitest/Vite `test.include` patterns where that finite shape can
be proved from syntax. Supported globs are relative literals with `*`, `**`
and `?`; config callbacks, spreads, alternate roots, projects/workspaces and
inline includeSource discovery remain unsupported. Exclude expressions only
narrow this admitted candidate set and are not evaluated. Beside-test helpers
outside the literal include are named notes and remain ordinary dependencies.
Missing or unproved runner configuration retains suffix candidates and selects
the whole known suite on change. Deleted tests remain changed evidence, never runnable head
paths. Package/config/helper/setup and executable-mode changes select all known
tests. A missing base does the same.

Literal `setupFiles` and `globalSetup` roots join every test's dependency set.
Their changed closures, filesystem/process access and unknown loaders receive
separate `shared-setup-*` reasons; unknown setup shapes select the whole suite.

`modules`, `requests` and `loaders` inventory runtime requests without importing
them. `exports` follows named declarations, renamed reexports, local import
aliases, defaults and finite star exports to actual binding owners. Namespace
imports stay broad. `dependencies` retains the barrel path and its possible
load effects, including transitive registration calls, even when named-owner
narrowing excludes unrelated inert exports. Unknown initialization remains
conservative; constants are inert only for the small literal/function grammar.
Signature-only overloads and erased companions of a runtime binding do not
invent duplicate runtime owners. Actual duplicate implementations and other
unproved declaration merges remain uncertain. Transparent type wrappers and
erased type syntax do not turn safe global property reads into loader aliases.
Both head and base graphs participate, so deleted paths remain reachable.
Tracked JSON/binary targets propagate through their importer just like source.

`selection` adds filesystem/path/known glob consumers to the always-run set,
including readers reached through helpers, even for erased-type edits. This
is intentionally broader than proving that a particular call reads source.
Unknown dynamic targets, source aliases, cyclic/ambiguous export ownership,
loader aliases, module/VM loader construction and reflection retain reasons
and conservatively select their reachable tests when any path changes.
Unresolved source ownership never becomes a guessed external dependency.
Tracked package names, including the root package itself, override declared
external dependencies; their bare-name routing stays uncertain until resolved.
Malformed nested package metadata leaves possible package names unknown and
bare-import consumers conservative; an invalid root manifest is an input error.
Reachable `child_process`, `worker_threads`, `execa`, `zx` and `shelljs` imports
retain tests in the always-run set with explicit process-loading uncertainty.
This finite vocabulary does not interpret commands or prove arbitrary process
wrappers absent.

Compiler-only classification needs a finite erased syntax proof in both trees:
interfaces, type aliases and explicit type-only imports/exports. Ambient and
regular/const enums, opaque declarations and other runtime syntax do not gain
that credit. Always-run or uncertain tests keep runtime selection active.
Compiler validation is requested but is not executed by this package.

Internal AST/maps/sets stay inside these modules. Public results contain JSON
data only. Complete coverage means the admitted static cases were resolved;
it is not a whole-program execution theorem or a complete custom-runner model.
This feature changes no workflow, required status, draft policy or merge gate.
