# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-07-13

### Added

- Shape inference from captured JSON payloads: integer vs float
  numbers, per-path string vocabularies and hit counts, arrays with
  merged element shapes, objects with sorted fields, unions across
  JSON types, and loud rejection of non-JSON input (`NaN`,
  `undefined`, class instances).
- Multi-example merging that is order-independent by construction:
  fields missing from any capture become optional, integers widen to
  numbers, differing kinds union (nullability is a `null` variant),
  and `any` absorbs everything.
- A conservative enum heuristic: a string vocabulary locks only when
  it is small (≤ 8 values), format-free, and at least one value
  repeated across observations — a single capture can never lock,
  and two UUIDs are a coincidence, not an enum.
- String format pinning with strict detectors: `uuid`,
  `iso-date-time` (RFC 3339, mandatory offset, calendar-validated),
  `iso-date`, `email`, and `url` (http/https only).
- The drift checker with seven issue kinds — `missing-field`,
  `new-field`, `type-changed`, `null-value`, `new-enum-value`,
  `format-changed`, `number-widened` — each reported with a concrete
  payload path and a one-line explanation; one bad field never hides
  another.
- Per-path tolerance rules (`optional`, `nullable`, `any`,
  `open-enum`, `open-format`, `number`, `extra-fields`) addressed by
  glob-like patterns (`*` = one segment, `**` = any run); malformed
  patterns are hard errors, never silent no-ops.
- Versioned, byte-deterministic pin files (`"shapepin": 1`) with
  fixed key order and sorted collections, rejected loudly by readers
  that do not understand the version.
- The `pin` command (`--merge`, `--force`, `--split`, repeatable
  `--tolerate`), `check` (`--update`, `--json`), `show` (TypeScript-ish
  signature rendering, `--json`), `ls` and `tolerate` (`--rm`); stdin
  via `-`; exit codes 0/1/2 (clean / drift / usage or input error)
  for CI gating.
- Public programmatic API (`infer`, `mergeShapes`, `checkValue`,
  `parsePin`, `serializePin`, `matchPath`, `renderShape`, …) with
  type declarations, for asserting on payload shapes inside any test
  runner.
- A committed example capture suite (`examples/orders-api/`) with its
  pin and a deliberately drifted payload, exercising every inference
  feature.
- Test suite: 89 node:test tests (unit + CLI integration in temp
  workspaces) and an end-to-end `scripts/smoke.sh` against the
  bundled examples.

[0.1.0]: https://github.com/JaydenCJ/shapepin/releases/tag/v0.1.0
