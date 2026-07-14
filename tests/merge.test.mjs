// Shape merging and the enum-locking heuristic. Merging must be
// order-independent — the same captures in any order must produce the
// same pin, or pin files would churn in git for no reason.
import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";
import { enumOf, infer, inferAll, mergeShapes } from "../dist/index.js";

test("same-kind scalars merge structurally: booleans no-op, integer+float widens", () => {
  deepStrictEqual(mergeShapes(infer(true), infer(false)), { kind: "boolean" });
  deepStrictEqual(mergeShapes(infer(null), infer(null)), { kind: "null" });
  deepStrictEqual(mergeShapes(infer(1), infer(2.5)), {
    kind: "number",
    integer: false,
  });
});

test("string merges accumulate sorted values, total hits, agreeing formats", () => {
  const merged = mergeShapes(infer("b"), infer("a"));
  deepStrictEqual(merged.values, ["a", "b"]);
  strictEqual(merged.hits, 2);
  const uuid = "5e6f7a8b-9c0d-4e1f-a2b3-c4d5e6f7a8b9";
  const other = "1f2e3d4c-5b6a-4798-8a9b-0c1d2e3f4a5b";
  strictEqual(mergeShapes(infer(uuid), infer(other)).format, "uuid");
  strictEqual(mergeShapes(infer(uuid), infer("plain")).format, null);
});

test("value tracking stops past the cap (open string, no vocabulary)", () => {
  const examples = Array.from({ length: 25 }, (_, i) => `value-${i}`);
  const shape = inferAll(examples);
  strictEqual(shape.values, null);
  strictEqual(shape.hits, 25);
  strictEqual(enumOf(shape), null);
});

test("different kinds merge into a union; matching kinds merge into the variant", () => {
  const union = mergeShapes(infer("x"), infer(null));
  strictEqual(union.kind, "union");
  deepStrictEqual(
    union.variants.map((v) => v.kind),
    ["null", "string"],
  );
  const merged = mergeShapes(union, infer("x"));
  strictEqual(merged.variants.length, 2);
  strictEqual(merged.variants.find((v) => v.kind === "string").hits, 2);
});

test("merge is order-independent for object trees", () => {
  const a = { id: 1, tags: ["x"], meta: { deep: true } };
  const b = { id: 2.5, tags: [], extra: "only-here" };
  const c = { id: 3, tags: ["y", "z"], meta: { deep: false } };
  deepStrictEqual(inferAll([a, b, c]), inferAll([c, a, b]));
});

test("a field missing from any example becomes optional, and stays optional", () => {
  const shape = inferAll([{ a: 1, b: 2 }, { a: 1 }]);
  strictEqual(shape.fields.b.optional, true);
  strictEqual(shape.fields.a.optional, false);
  strictEqual(inferAll([{ a: 1 }, {}, { a: 2 }]).fields.a.optional, true);
});

test("empty arrays defer to the first non-empty merge partner", () => {
  const shape = mergeShapes(infer([]), infer([1]));
  deepStrictEqual(shape.items, { kind: "number", integer: true });
});

test("any absorbs everything it merges with", () => {
  deepStrictEqual(mergeShapes({ kind: "any" }, infer({ a: 1 })), { kind: "any" });
  deepStrictEqual(mergeShapes(infer("x"), { kind: "any" }), { kind: "any" });
});

// --- the enum heuristic ---------------------------------------------------

test("a repeated small vocabulary locks as an enum", () => {
  // Five observations, three distinct values: repetition signals a
  // closed set.
  const shape = inferAll(["shipped", "pending", "shipped", "delivered", "shipped"]);
  deepStrictEqual(enumOf(shape), ["delivered", "pending", "shipped"]);
});

test("no repetition, no lock: single examples and all-distinct values stay open", () => {
  strictEqual(enumOf(infer("shipped")), null);
  strictEqual(enumOf(inferAll(["Alice", "Bob"])), null);
});

test("formatted strings never lock as enums — two UUIDs are a coincidence", () => {
  const shape = inferAll([
    "5e6f7a8b-9c0d-4e1f-a2b3-c4d5e6f7a8b9",
    "5e6f7a8b-9c0d-4e1f-a2b3-c4d5e6f7a8b9",
  ]);
  strictEqual(shape.format, "uuid");
  strictEqual(enumOf(shape), null);
});

test("vocabularies larger than ENUM_MAX stay open even with repeats", () => {
  const values = [];
  for (let i = 0; i < 9; i++) values.push(`code-${i}`, `code-${i}`);
  strictEqual(enumOf(inferAll(values)), null);
});
