**Support** — tracked source references and declaration-owner citations.

Documents, actual comments and known filesystem-reader arguments are data.
Ordinary strings are not presumed live references. No referenced path is read
from the host. Declaration ownership uses AST declarations, not text matches or
forward imports/exports. Historical references stay separately visible. Dynamic
readers, ambiguous basenames and unsupported patterns remain unverified.

An existing source-reader path proves existence only. Inventories skip reader
analysis and report `mode: skipped-inventory` with `unverifiedCount: null`;
skipped work is not a measured zero. Comparisons analyze only code files with
literal paths of source files that lost declarations, considering both trees.
A cheap text prefilter precedes the check of already-parsed string literals.
`sourceReaders.unverifiedCount` then counts current-head uncertainty records;
the base count and analyzed paths stay separate. No expected declaration is
inferred from string matching or a nearby comment. Whole-file inspection may be
intentional and is not a wrong-owner finding. Document/comment citations always
remain active, independently of this scoped reader pass.

`sourceReaders.declarationLossLiterals` is an advisory list for a head/base diff:
known AST declaration names disappeared from a source file and a test or script
contains a literal naming that path. It neither requires a filesystem call nor
claims the literal expects a particular declaration. Scripts are code files in
`script/`, `scripts/` or `bin/`; tests use the existing test-path classifier.
The list uses exact strings/no-substitution templates, with root- or file-relative
path normalization. It does not evaluate constructed paths, decode arbitrary
URLs, inspect comments as reader annotations or prove semantic intent. The
parsed head/base context is internal; public reports contain JSON data only.

A shorthand owner citation such as `tools/tool.ts` resolves only when its
suffix identifies one tracked file under the root `src/`. Missing or ambiguous
shorthand roots stay unverified; explicit missing `src/` paths remain findings.
When a documentation package has its own matching `src/` tree, an unqualified
source-root citation is context-uncertain. Use a file-relative path to identify
that package explicitly. Literal reader paths never receive shorthand lookup.
