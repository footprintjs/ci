# Changelog

## [Unreleased]

## [4.1.0] - 2026-11-12

### Added

- Works with footprintjs 12: the dependency range is now `^11.0.0 || ^12.0.0`.
  An application installs one footprintjs, and HCI uses that one. Before this,
  an application on footprintjs 12 got a second, older engine nested under HCI.
  An application on footprintjs 11 needs no change. No HCI source or public
  import changed.

## [4.0.0] - 2026-11-05

### Migration: FootPrint 11 and Foottrace 1.11.1

- Requires `footprintjs ^11.0.0` and `foottrace ^1.11.1`.
  FootPrint 9 and 10 are no longer supported. Update the application's direct
  dependencies together and regenerate its lock normally; do not override a
  nested engine or keep a second physical copy.
- Record writing stays on `foottrace/write`, record reading on `foottrace`, and
  schema/guard helpers on `footprintjs` and `footprintjs/advanced`. No HCI public
  import or action-completion contract changes.
- Maintained demos move to AgentFootprint 14 and share the root npm workspace
  install/lock, so the linked HCI and the demo agent use one physical core cohort.
  Run `npm ci` from the repository root, then the demo workspace verify command.
  The parked paper harness and its paid comparison protocol are historical and excluded from this migration.

## [3.3.1] - 2026-11-04

### Security

- Clears the three development audit entries from the TypeDoc/minimatch
  advisory. Pin TypeDoc 0.28.20, scope minimatch 11.0.1 to that toolchain, and
  keep its public partial-match API compatible through a tracked development
  patch. Documentation generation explicitly applies and checks the patch;
  consumer installation gains no lifecycle hook. Native runtime and public
  exports are unchanged from 3.3.0.
