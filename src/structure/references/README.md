**Support** — tracked source references and declaration-owner citations.

Documents, actual comments and known filesystem-reader arguments are data.
Ordinary strings are not presumed live references. No referenced path is read
from the host. Declaration ownership uses AST declarations, not text matches or
forward imports/exports. Historical references stay separately visible. Dynamic
readers, ambiguous basenames and unsupported patterns remain unverified.
