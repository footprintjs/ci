**Support** — parse source text as TypeScript syntax data.

No program, compiler emission, plugin, project configuration or candidate code
is executed. Token spans retain code inside strings and JSX while excluding
comment-only and blank lines.

Tokens come from the parsed syntax tree, preserving the parser's regex,
template and JSX context. JSDoc nodes are excluded. A physical line is code
when a nonblank part of a syntax token intersects it. Canonical token hashes
include kind and exact token text, with trivia excluded. Move verification
must check comments separately; this hash alone cannot establish a pure move.
