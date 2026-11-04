**Support** — tracked snapshot paths, roles and public source doors.

Path resolution uses only supplied tracked files, never the host filesystem or
candidate configuration. Tests and declarations are excluded from the runtime
source graph. Unsupported/ambiguous mappings stay explicit. The Git adapter
provides committed snapshots without installing or executing candidate code.
