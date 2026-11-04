**Support** — tracked source references and declaration-owner citations.

Documents, actual comments and known filesystem-reader arguments are data.
Ordinary strings are not presumed live references. No referenced path is read
from the host. Declaration ownership uses AST declarations, not text matches or
forward imports/exports. Historical references stay separately visible. Dynamic
readers, ambiguous basenames and unsupported patterns remain unverified.

An existing source-reader path proves existence only. The current-head
`sourceReaders.unverifiedCount` counts reader uncertainty records, including
unexpressed intent; base uncertainty stays separately in coverage. No expected
declaration is inferred from string matching or a nearby comment. Whole-file
inspection may be intentional and is not a wrong-owner finding.

`sourceReaders.declarationLossLiterals` is an advisory list for a head/base diff:
known AST declaration names disappeared from a source file and a test or script
contains a literal naming that path. It neither requires a filesystem call nor
claims the literal expects a particular declaration. Scripts are code files in
`script/`, `scripts/` or `bin/`; tests use the existing test-path classifier.
The list uses exact strings/no-substitution templates, with root- or file-relative
path normalization. It does not evaluate constructed paths, decode arbitrary
URLs, inspect comments as reader annotations or prove semantic intent. The
parsed head/base context is internal; public reports contain JSON data only.
