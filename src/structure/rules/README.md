**Support** — fixed structural rules over measured source data.

Limits are part of the checker version. Candidate configuration cannot raise
them. A finding names its measured value and the next structural step.

The numeric-export exemption list is visible in declarations.mjs. It admits the
observed algorithm names `crc32` and `sha256`, whose numbers describe bit widths;
other numbered variants remain findings. Entries require a reason and an actual
finding as evidence. Each
finding carries a whole-unit identity and location so the ratchet can compare
all of a unit's metrics together. This code reports advisory observations;
required checks and hooks are separate owner decisions.
