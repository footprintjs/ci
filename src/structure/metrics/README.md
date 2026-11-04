**Support** — measure runtime syntax units using fixed counting semantics.

Public observations are JSON data. Nested function code contributes to outer
line counts, while its decisions belong to the separately measured function.
No limit is raised by the measured repository.

Only callables with bodies are runtime functions. Named identities include
their enclosing class, object and function names, without a path or body hash;
anonymous identities use canonical body tokens. Every unit also has a body
hash and exact source offsets. Parameter patterns and rest parameters each
count once; a TypeScript `this` parameter is excluded.

Complexity starts at one and adds if, loops, nondefault cases, catches,
conditional expressions and the logical operators `&&`, `||` and `??`.
Nested callables own their branches. Else-if arms are siblings. Control
statements add nesting; try, catch and finally bodies share the same level.
A PascalCase function receives the JSX allowance only for its own returned
JSX. Nested child components do not grant that allowance to the outer function.
Default-parameter initializers contribute their own decisions; functions inside
them remain separate units. Ambient classes and declaration-file classes do
not create runtime class observations.

`statementCount` counts syntactic statements inside a callable's block body,
including nested callable bodies and TypeScript declaration statements. Blocks
and empty semicolons are containers/padding; headers and default initializers are
outside this count. Concise expression bodies count zero, even when they contain
a block callback; that callback has its own count. This is a count only, with no
limit, rule, ratchet effect or claim about runtime work. Other metrics are unchanged.
