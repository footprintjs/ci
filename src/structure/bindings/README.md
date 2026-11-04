**Support** — resolve lexical declarations and finite immutable syntax values.

`index` exposes `resolveBinding(identifier) -> {declaration} | null` and the
lexical-presence query described below. Scope
owners are cached per actual SourceFile, without a Program/checker or candidate
evaluation. `patterns` finds binding leaves; `declarations` places declarations;
`scopes` preserves block, parameter/body, catch, loop and class-static ownership;
`references` distinguishes a value use from a property/declaration spelling.
`resolve` stops at the nearest scope, retaining ambiguity rather than falling
through to a convenient import. Overloads select a single runtime implementation.

`hasLexicalBinding(identifier)` separately reports lexical presence, including an
ambiguous local declaration set. A null declaration record must not admit an
unshadowed global `require`/`URL`: use absence from this presence API for that
claim. Presence still proves neither one selected declaration nor an immutable
value. Both functions are the index facade's only exports.

Lexical binding is not value proof. `immutable` separately follows const aliases,
parentheses/type wrappers and actual import declarations. Cycles, mutable aliases,
TDZ uses, unavailable initializers and unsupported declarations are unknown.
`imports` retains exact module/export spelling and rejects erased imports.
`writes` invalidates explicit assignment/update/delete, including direct const
alias property writes. `properties` admits only finite literal fields and reports
spreads, computed keys, duplicates and accessors as uncertainty.
`escapes` rejects prior external argument/return/container escapes of constructed
or literal const handles, including direct immutable aliases. This preserves
uncertainty rather than assuming const freezes a handle's properties.

This is syntax admission, not whole-program alias or runtime effect analysis.
Reflective mutation, external object escapes, proxies, namespace augmentation,
dynamic scope, import-equals and unsupported binding grammars do not acquire
immutable proof from a matching name. Callers must preserve unsupported origins
as unverified; const does not make an arbitrary object's properties immutable.
The declaration record/AST stays internal and never enters a public JSON report.

Tests are colocated. The original off-repo lexical battery was copied unchanged;
its additional cases have no independent red receipt. Current implementations
and helper fixtures are source-authored only, with execution still unrun.
