# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.81.0] - 2026-11-12

### Fixed

- Accept footprintjs 12 alongside footprintjs 11: the peer range is now
  `^11.0.0 || ^12.0.0`. Before this, npm refused Lens beside footprintjs 12.
  footprintjs 12 also needs agentfootprint 14.4.0 or newer, the first that
  accepts it. Lens runtime source, public exports and saved-record formats are
  unchanged; an application on footprintjs 11 needs no change.

## [0.80.0] - 2026-11-05

### Breaking

- Support agentfootprint 14 and footprintjs 11 only, with Foottrace 1.11.1
  or newer. Earlier installed runtime lines are not supported;
  old saved recordings remain readable.

### Changed

- Pin the final `agentfootprint@14.0.0` and `footprintjs@11.0.0` cohort, with
  a normally generated committed dependency lock.
- Group the explain view under STAND — State · Trace · Assess · Name · Decide,
  retaining the account's sentences, the answer's standing, its recorded reasons
  and evidence pointers.

## [0.79.0] - 2026-11-02

### Fixed

- Accept AgentFootprint 13 alongside the existing 9, 10, 11 and 12 peer ranges.
  The compatibility lane checks strict source and packed-package installation,
  runtime imports and declarations against the exact 13.0.0 source, retaining
