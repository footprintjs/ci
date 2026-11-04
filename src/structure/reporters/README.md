**Adapter** — format existing observations without changing their verdicts.

JSON retains findings, coverage, identities, source locations and fixed limits.
Text is a compact human summary. Neither formatter grants merge authority.

Affected estimates lead with selected/known test counts. Reason counts count
unique selected tests per kind and may overlap across kinds. JSON retains this
selection object as its first field. Human paths quote control characters.

Move summaries show unit, finding, uncertainty and ancillary counts. Details
quote source-controlled names and paths, and reference findings retain their
actual target names. JSON contains all records when the text detail cap applies.
