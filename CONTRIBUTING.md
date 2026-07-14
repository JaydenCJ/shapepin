# Contributing to shapepin

Issues, discussions and pull requests are all welcome — this project
aims to stay small, zero-dependency at runtime, fully offline and
deterministic down to the last byte of every pin file.

## Getting started

Requirements: Node.js >= 22.13 (for the stable `node:test` runner used by the suite).

```bash
git clone https://github.com/JaydenCJ/shapepin.git
cd shapepin
npm install            # installs typescript, the only devDependency
npm run build          # compile TypeScript to dist/
npm test               # build + 89 node:test tests
bash scripts/smoke.sh  # end-to-end CLI check against examples/
```

`scripts/smoke.sh` exercises the real CLI (pin determinism, clean and
drifted checks, tolerances, `check --update`, `--json` stability,
stdin, and every exit code) against the committed example captures
and must print `SMOKE OK`.

## Before you open a pull request

1. `npx tsc -p tsconfig.json --noEmit` — the tree must type-check clean (strict mode is enforced).
2. `npm test` — all tests must pass.
3. `bash scripts/smoke.sh` — must print `SMOKE OK`.
4. Add tests for behavior changes; keep logic in pure, unit-testable
   modules (inference, merging, matching and checking take values and
   return data — only `cli.ts` touches the filesystem or the process).
5. Anything that changes what a set of captures infers to — the enum
   heuristic, format detectors, merge semantics, pin serialization —
   is a **breaking change for every committed pin in every downstream
   repo**. Say so in the PR, update
   [docs/pin-format.md](docs/pin-format.md), and expect it to wait
   for a minor release.

## Ground rules

- **No runtime dependencies.** The zero-dependency install is a core
  feature; adding one needs justification in the PR and will usually
  be declined. The inference engine and matcher are in-repo on purpose.
- No network calls, ever — shapepin reads and writes local JSON. A
  contract gate must run in CI without secrets or connectivity.
- Determinism is API: same captures in any order, byte-identical pin
  files, report order and exit codes — no clocks, no randomness, no
  locale-dependent sorting.
- Checking stays honest: never invent a constraint an example did not
  prove, and never silently skip one a pattern typo failed to relax —
  malformed tolerances are hard errors.
- Code comments and doc comments are written in English.

## Reporting bugs

Please include: `shapepin --version` output, the exact command line,
and a *minimal* set of capture files plus the payload that checks
wrongly — a shape inferred too tight, drift that goes unreported, or
an error pointing at the wrong path. The files under
`examples/orders-api/` are a good template for a self-contained repro.

## Security

Do not open public issues for security problems (e.g. a crafted pin
name or pin file that escapes the pin directory or overwrites files
on write); use GitHub private vulnerability reporting on this
repository instead.
