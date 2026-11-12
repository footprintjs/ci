# src/shared

Small rules that BOTH release tools use: the hold check (`src/hold/`) and the release route
(`src/release-route/`). Each has one owner here, so the two can never drift apart:

- `http.mjs · boundedGet`: the one bounded GET (https only, redirects refused, one held timer over
  request and body, a byte bound while streaming). Failures are `HttpFailure` with a `kind`; each
  feature words them in its own vocabulary.
- `text.mjs · clean / flatten / cleanLines`: the one cleaner for untrusted text (control, format and
  bidi characters out, `::` and `##[` broken apart for the log, bounded).
- `github.mjs`: the fixed API host `https://api.github.com` (GITHUB_API_URL is not read; GitHub
  Enterprise is not supported), the token's shape, the request headers, a repository name's shape.

Why a folder of its own: neither feature imports the other. Files here import only `node:`
modules and each other; `test/shared/layering.test.mjs` fails otherwise. The shadow's own client
(`src/github-readonly.mjs`) and `src/guards/` are deliberately not moved here: they go when the
shadow goes.
