# FootPrint shared release flow — Beta

One release flow for the FootPrint library ecosystem, with the run record as its explanation. This source-only Beta is not published on npm.

**v1 is a read-only Foottrace shadow trial.** It reuses Foottrace's existing release guards and records seven native FootPrint stages:

```text
plan → propose → verdict → authority → build → publish → verify
```

Planning and verification read real GitHub/npm evidence. Steps requiring changes stop with a named refusal, or are recorded as skipped when the plan requires verification only. The executable cannot create a proposal, reserve an attempt or publish. Its policy tests exercise those existing guards using fixtures; those tests are not live release authorization.

## Try the committed bundle

Use Node 22.14 or newer. Download/checkout one **reviewed full commit** of this repository, then run:

```sh
node dist/release.cjs --mode shadow --phase control \
  --source-sha <exact-current-foottrace-main-SHA> --output release-shadow
```

No installation is needed to run the committed bundle. For GitHub rate limits, an existing read-only `GH_TOKEN` may be supplied through the environment; it is sent only to fixed GitHub GET endpoints. The registry never receives it. Do not put credentials in command arguments, files or records. The CLI cannot load another configuration or enable live mode. Add `--verify-only true` to explicitly inspect the current publication without proposing or consuming queued changes; the default reports what ordinary planning would do.

`record.json` contains the native snapshot and graph; `result.json` contains stage outcomes; `observations.json` contains response digests, sizes and statuses. Rich provider bodies, archives and credentials stay outside recorded scope. `summary.json` is the short outcome. A held/incomplete run exits nonzero. A complete observation is evidence of what was checked, not a grant to publish.

Reopen saved native evidence without repeating network checks:

```js
import { readFile } from 'node:fs/promises';
import { explainReleaseRecord } from './src/record.mjs';
const record = JSON.parse(await readFile('release-shadow/record.json', 'utf8'));
console.log(explainReleaseRecord(record, 'verifyResult'));
```

The reader uses Foottrace's existing causal slice APIs. It explains recorded reads and writes; opaque provider checks remain an explicitly bounded visibility boundary.

## What is preserved

Six production guards are copied byte-for-byte from a pinned Foottrace source commit; the complete native release corpus is retained. Adapted guard/helper tests exercise the production copies; historical runner/workflow compatibility tests retain their snapshots. [Provenance](provenance/upstream.json) records every source hash and test-only adaptation. The adapter preserves source closure, reviewed/tested trees, App identity, archive/producer binding, retained history, reservation and unknown-outcome refusals. Uniform review policy additionally requires an exact-head public Claude verdict and disclosed delegated eligible-User approval. Normal security gates are mandatory.

The runtime is pinned independently of the candidate: FootPrint 10.7.1 and Foottrace 1.10.0, with a dependency-complete committed bundle. npm 11.19.0 is separately vendored with its digest for a future reviewed publisher; it is **not executable through this shadow**. [Third-party notices](provenance/THIRD_PARTY_NOTICES.md).

## Develop and review

```sh
npm ci --ignore-scripts
npm test
npm run build
# Commit the rebuilt dist files together with source changes.
```

Ordinary CI runs the full suite on Node 22 and 24 and rejects bundle drift. The [shadow workflow](.github/workflows/release.yml) is reusable, read-only and pinned by full commit; no caller has been migrated. Its strict preflight requires a canonical JSON caller (valid YAML) and checks the actual caller job pin against the tool input before checkout; see the [caller contract](docs/CALLER.md). Actions artifacts retain bounded records for 90 days. Missing records or failed uploads remain incomplete evidence.

[Architecture and rollout limits](docs/CONTRACT.md) · [Measured footprint](docs/SIZE.md) · [Trial evidence](docs/TRIAL.md)

Future live cutover needs its own exact-head review and owner approval: separate build/control/publisher jobs, real App/OIDC and archive binding, mandatory repository/consumer gates and current authority rechecks. No npm trust, credential or live publisher configuration is changed by this version. Version-set promotion and the broader ecosystem checker remain separate design work.
