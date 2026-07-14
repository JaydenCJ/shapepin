# The pin file format

A pin is a JSON file, `<dir>/<name>.pin.json` (default directory:
`__shapepins__/`), meant to be committed next to the captures it was
inferred from. The file is written with a fixed key order, sorted
object fields, sorted enum values and sorted tolerances, so
re-pinning the same captures — in any order — is byte-identical and
the git diff of a pin **is** the contract change.

```json
{
  "shapepin": 1,
  "name": "orders",
  "examples": 3,
  "tolerances": [
    { "path": "/orders/*/note", "rule": "optional" }
  ],
  "shape": { "kind": "object", "fields": { "…": {} } }
}
```

| Key | Meaning |
|---|---|
| `shapepin` | Format version. Readers reject versions they do not understand. |
| `name` | Pin name; also the file name. `[A-Za-z0-9._-]`, must not start with a separator. |
| `examples` | How many captured payloads the shape was inferred from. |
| `tolerances` | Per-path relaxation rules (see below). |
| `shape` | The inferred shape tree. |

## Shape nodes

Every node has a `kind`. Optional keys are omitted when they carry no
information, which keeps pins small and diffs quiet.

| `kind` | Extra keys | Notes |
|---|---|---|
| `null` | — | Only `null` was ever observed here. |
| `boolean` | — | |
| `number` | `integer` | `true` when every observed value was an integer. |
| `string` | `format?`, `values?`, `hits` | See "Strings" below. |
| `array` | `items` | Merged shape of all elements; `null` if only `[]` was seen. |
| `object` | `fields` | Map of key → `{ optional?, shape }`, keys sorted. |
| `union` | `variants` | ≥2 distinct non-union kinds, sorted; `null` variant = nullable. |
| `any` | — | Unconstrained (only produced by hand-editing or tooling). |

### Strings, formats and the enum heuristic

For every string path the pin records `hits` (how many values were
observed) and, up to a cap of 20 distinct values, the sorted `values`
themselves. `format` is present when **every** observed value matched
the same detector: `uuid`, `iso-date-time` (RFC 3339 with mandatory
offset), `iso-date`, `email`, or `url` (http/https only).

At check time the vocabulary is treated as a **locked enum** when all
of these hold:

1. `values` is still tracked (≤ 20 distinct) and has ≤ 8 entries,
2. no `format` was detected (two UUIDs are a coincidence, not an enum),
3. at least one value repeated (`values.length < hits`) — repetition
   across observations is the signal that the set is closed. A single
   example can never lock an enum.

Everything else is an open string: any value passes (subject to
`format`, if pinned).

## Tolerance rules

Tolerances relax one specific kind of drift at paths matched by a
pattern. Segments are separated by `/`; `*` matches exactly one
segment (a key or an array index); `**` matches any run of segments,
including none. Patterns are validated on load — a typo fails the
run rather than silently tolerating nothing.

| Rule | Silences | Applies at |
|---|---|---|
| `optional` | `missing-field` | the missing field's path |
| `nullable` | `null-value` | the value's path |
| `any` | everything | the subtree root |
| `open-enum` | `new-enum-value` | the string's path |
| `open-format` | `format-changed` | the string's path |
| `number` | `number-widened` | the number's path |
| `extra-fields` | `new-field` | the **object**, not the new key |

There is deliberately no tolerance for `type-changed`: a value that
changes JSON type is the drift this tool exists to catch. If the
change is intended, accept it with `check --update` (which merges the
payload into the pin, widening it to a union) or re-pin.

Keys containing a literal `/` or `*` are checked normally but cannot
be targeted by a tolerance pattern in format version 1.

## Updating pins

- `shapepin pin <name> --merge <captures…>` folds new captures into
  the existing shape and bumps `examples`.
- `shapepin check <name> --update <payloads…>` does the same with
  payloads that just failed a check — the "accept the drift" path.
- `shapepin tolerate <name> "<path>=<rule>"` adds a rule (`--rm`
  removes it). Rules are deduplicated and kept sorted.

Merging only ever widens: fields become optional, integers become
numbers, vocabularies grow, kinds union. Narrowing a contract back
down is a re-pin from fresh captures (`--force`).
