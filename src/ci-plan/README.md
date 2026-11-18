# CI plan in observe mode

The caller adds an advisory job. Existing checks receive no outputs from the plan and continue on their usual routes. The reusable workflow runs only its own immutable revision and has read access to Actions, contents, and pull requests. It never executes code from the proposed change.

FootPrint gathers the exact checkout tree and the check cells GitHub has exposed. Its decider evaluates each cell and writes the evidence and outcome to the job summary. Jobs that are still unlisted, have unknown inputs, or lack sufficient evidence run normally. The path estimate is displayed beside the record.

A reusable receipt must come from an approved isolated producer at an immutable revision. The verifier joins the receipt digest and producer attempt, the tested repository and workflow revision, run and attempt, and each actual job identity and outcome. The summary is advisory data and cannot serve as a receipt. Neither caller currently produces the fully bound receipt needed for same-input or packed-package reuse. The existing tree marker proves the checkout tree alone.

Version-only proposals require a complete exact diff replayed by the trusted planner and explicit cell input declarations. Protected release checks, version-sensitive checks and cells with unknown inputs continue running. Pack equality also requires a prior admitted pass for the same consumer and inputs. A failed observed would-skip cell invalidates that proposal.

Run the isolated tests with `npm ci --ignore-scripts --no-audit --no-fund` and `npm test` in this directory.
