# shapepin examples

## orders-api

Three captured responses of a fictional `GET /orders` endpoint
(`captures/orders-page*.json`), the pin inferred from them
(`__shapepins__/orders.pin.json`), and one payload that drifted
(`drifted/orders-drift.json`).

The captures were chosen to exercise every inference feature:

| Field | What it demonstrates |
|---|---|
| `orders[].id`, `customer.id` | `uuid` format pinning (no enum — formats never lock) |
| `orders[].status` | enum locking: `"delivered" \| "pending" \| "shipped"` (values repeat across captures) |
| `orders[].placedAt` | `iso-date-time` format pinning, `Z` and `+09:00` offsets |
| `orders[].note` | `null \| string` union (nullable observed, not declared) |
| `orders[].trackingNumber` | optional field (absent on pending orders) |
| `orders[].items[].qty` | integer pinning (a float here is drift) |
| `orders[].items[].sku` | open string (all values distinct → no enum lock) |
| `customer.email` | `email` format pinning |

The committed pin also carries one tolerance, added at pin time:

```bash
shapepin pin orders captures/*.json --tolerate "/orders/*/note=optional"
```

Try it (from this directory, after `npm install && npm run build` at
the repository root):

```bash
alias shapepin="node ../../dist/cli.js"
cd orders-api

shapepin show orders                          # the inferred signature
shapepin check orders captures/*.json         # exit 0 — clean
shapepin check orders drifted/orders-drift.json   # exit 1 — 4 issues
```

The drifted payload contains four regressions on purpose — a price
that became a string, a brand-new `discount` field, an unknown
`"canceled"` status and a `placedAt` that is no longer a timestamp —
plus one *tolerated* change (the missing `note`), which does not
appear in the report.
