#!/usr/bin/env bash
# Smoke test for shapepin: exercises the real CLI end to end against
# the committed example capture suite. No network, idempotent, runs
# from a clean checkout (after `npm install`). This script plus
# `npm test` is the whole verification story — the repository
# intentionally ships no CI. Prints "SMOKE OK" on success.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$(pwd)"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

fail() {
  echo "SMOKE FAIL: $1" >&2
  exit 1
}

# 1. Build (idempotent).
npm run build >/dev/null 2>&1 || fail "npm run build failed"
CLI="node $ROOT/dist/cli.js"
echo "[smoke] build ok"

# 2. --version matches package.json; --help documents every command.
PKG_VERSION="$(node -p "require('$ROOT/package.json').version")"
CLI_VERSION="$($CLI --version)"
[ "$CLI_VERSION" = "$PKG_VERSION" ] || fail "--version mismatch: $CLI_VERSION != $PKG_VERSION"
HELP="$($CLI --help)"
for word in pin check show ls tolerate --merge --update --tolerate "Exit codes"; do
  echo "$HELP" | grep -q -- "$word" || fail "--help missing $word"
done
echo "[smoke] --help/--version ok ($CLI_VERSION)"

# 3. Re-pinning the committed example captures is byte-identical to the
#    committed pin file — determinism is the whole point of a pin.
EX="$ROOT/examples/orders-api"
$CLI pin orders --dir "$WORKDIR/pins" \
  --tolerate "/orders/*/note=optional" \
  "$EX/captures/orders-page3.json" \
  "$EX/captures/orders-page1.json" \
  "$EX/captures/orders-page2.json" >/dev/null || fail "pin failed"
diff -u "$EX/__shapepins__/orders.pin.json" "$WORKDIR/pins/orders.pin.json" \
  || fail "re-pinned file differs from the committed pin (determinism broken)"
echo "[smoke] pin determinism ok"

# 4. The captures the pin was inferred from check clean — exit 0.
(cd "$EX" && $CLI check orders captures/*.json >/dev/null) \
  || fail "committed captures should check clean"
echo "[smoke] clean captures ok (exit 0)"

# 5. The drifted payload fails with the expected issues — exit 1.
set +e
DRIFT="$(cd "$EX" && $CLI check orders drifted/orders-drift.json)"
DRIFT_EXIT=$?
set -e
[ "$DRIFT_EXIT" -eq 1 ] || fail "drifted payload should exit 1, got $DRIFT_EXIT"
for want in "type-changed" \
            'pinned number, got string ("12.99")' \
            "/orders/0/items/0/discount" \
            'new-enum-value' \
            '"canceled" is not one of "delivered" | "pending" | "shipped"' \
            "format-changed" \
            "0 clean, 1 drifted, 4 issues"; do
  echo "$DRIFT" | grep -qF -- "$want" || fail "drift report missing: $want"
done
# The omitted note is covered by the committed optional tolerance.
if echo "$DRIFT" | grep -q "note"; then
  fail "tolerated /orders/*/note drift leaked into the report"
fi
echo "[smoke] drift detection ok (exit 1)"

# 6. --json is deterministic and structurally intact.
set +e
A="$(cd "$EX" && $CLI check orders drifted/orders-drift.json --json)"
B="$(cd "$EX" && $CLI check orders drifted/orders-drift.json --json)"
set -e
[ "$A" = "$B" ] || fail "check --json is not deterministic"
echo "$A" | node -e "
  const d = JSON.parse(require('fs').readFileSync(0, 'utf8'));
  if (d.tool !== 'shapepin') throw new Error('tool');
  if (d.ok !== false) throw new Error('ok');
  if (d.summary.issues !== 4) throw new Error('summary.issues');
  const kinds = d.payloads[0].issues.map(i => i.kind).sort();
  const want = ['format-changed', 'new-enum-value', 'new-field', 'type-changed'];
  if (JSON.stringify(kinds) !== JSON.stringify(want)) throw new Error('kinds: ' + kinds);
" || fail "check --json is not structurally intact"
echo "[smoke] --json + determinism ok"

# 7. Tolerances silence exactly what they name, in a scratch copy.
mkdir -p "$WORKDIR/api"
cp -R "$EX/captures" "$EX/drifted" "$EX/__shapepins__" "$WORKDIR/api"
cd "$WORKDIR/api"
$CLI tolerate orders "/orders/*/status=open-enum" | grep -q "added" || fail "tolerate add failed"
$CLI tolerate orders "/orders/*/placedAt=open-format" >/dev/null
$CLI tolerate orders "/orders/*/items/*=extra-fields" >/dev/null
set +e
PARTIAL="$($CLI check orders drifted/orders-drift.json)"
PARTIAL_EXIT=$?
set -e
[ "$PARTIAL_EXIT" -eq 1 ] || fail "type change must still fail after tolerances"
echo "$PARTIAL" | grep -qF "1 issue" || fail "expected exactly 1 remaining issue"
echo "$PARTIAL" | grep -qF "type-changed" || fail "remaining issue should be the type change"
echo "[smoke] tolerances ok (3 of 4 issues silenced)"

# 8. check --update accepts the drift; the suite is green again.
$CLI check orders drifted/orders-drift.json --update | grep -q "now 4 examples" \
  || fail "check --update should merge the payload"
$CLI check orders drifted/orders-drift.json captures/*.json >/dev/null \
  || fail "check should pass after --update"
$CLI show orders | grep -qF '"canceled" | "delivered" | "pending" | "shipped"' \
  || fail "show should include the widened enum"
echo "[smoke] check --update ok"

# 9. ls and show read back what pin wrote.
LS_OUT="$($CLI ls)"
echo "$LS_OUT" | grep -q "orders" || fail "ls should list the pin"
echo "$LS_OUT" | grep -q "4 examples" || fail "ls should show the example count"
$CLI show orders --json | node -e "
  const d = JSON.parse(require('fs').readFileSync(0, 'utf8'));
  if (d.shapepin !== 1 || d.name !== 'orders') throw new Error('pin doc');
" || fail "show --json should print the pin file"
# A consumer closing the pipe early (head) must not crash the CLI.
$CLI show orders | head -n 1 >/dev/null || fail "closed pipe should not crash the CLI"
echo "[smoke] ls/show ok"

# 10. Error handling: bad commands, flags and inputs exit 2.
expect2() {
  set +e
  "$@" >/dev/null 2>&1
  local code=$?
  set -e
  [ "$code" -eq 2 ] || fail "expected exit 2 from: $* (got $code)"
}
expect2 $CLI frobnicate
expect2 $CLI check orders --updaet drifted/orders-drift.json
expect2 $CLI check no-such-pin captures/orders-page1.json
expect2 $CLI check orders no-such-file.json
expect2 $CLI pin orders captures/orders-page1.json   # exists, no --merge/--force
expect2 $CLI tolerate orders "/orders/*/status=frobnicate"
echo "[smoke] error handling ok (exit 2)"

# 11. stdin ("-") works for check.
echo '{"orders": [], "page": {"number": 1, "size": 20, "totalPages": 0}}' \
  | $CLI check orders - >/dev/null || fail "stdin payload should check clean"
echo "[smoke] stdin ok"

echo "SMOKE OK"
