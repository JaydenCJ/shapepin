// Shape inference from single examples: every JSON type maps to the
// right shape node, and non-JSON inputs are rejected loudly instead
// of pinning garbage.
import { deepStrictEqual, strictEqual, throws } from "node:assert";
import { test } from "node:test";
import { infer, inferAll, InputError } from "../dist/index.js";

test("null and booleans infer bare scalar shapes", () => {
  deepStrictEqual(infer(null), { kind: "null" });
  deepStrictEqual(infer(true), { kind: "boolean" });
  deepStrictEqual(infer(false), { kind: "boolean" });
});

test("integers and floats are told apart (including -0 and big safe ints)", () => {
  deepStrictEqual(infer(42), { kind: "number", integer: true });
  deepStrictEqual(infer(-0), { kind: "number", integer: true });
  deepStrictEqual(infer(2 ** 52), { kind: "number", integer: true });
  deepStrictEqual(infer(3.14), { kind: "number", integer: false });
});

test("strings record their value, hits and detected format", () => {
  deepStrictEqual(infer("hello"), {
    kind: "string",
    format: null,
    values: ["hello"],
    hits: 1,
  });
  strictEqual(infer("5e6f7a8b-9c0d-4e1f-a2b3-c4d5e6f7a8b9").format, "uuid");
});

test("array elements merge into one items shape; empty arrays pin items=null", () => {
  deepStrictEqual(infer([1, 2.5]), {
    kind: "array",
    items: { kind: "number", integer: false },
  });
  deepStrictEqual(infer([]), { kind: "array", items: null });
});

test("mixed-type array elements form a union in kind order", () => {
  const shape = infer([1, "a", null]);
  strictEqual(shape.items.kind, "union");
  deepStrictEqual(
    shape.items.variants.map((v) => v.kind),
    ["null", "number", "string"],
  );
});

test("object fields are sorted, required by default, undefined skipped", () => {
  const shape = infer({ b: 1, a: "x", c: undefined });
  deepStrictEqual(Object.keys(shape.fields), ["a", "b"]);
  strictEqual(shape.fields.a.optional, false);
  strictEqual(shape.fields.b.optional, false);
});

test("nested structures infer recursively", () => {
  const shape = infer({ user: { tags: ["a"] } });
  strictEqual(shape.fields.user.shape.kind, "object");
  strictEqual(shape.fields.user.shape.fields.tags.shape.kind, "array");
});

test("inferAll folds several examples and refuses zero", () => {
  const shape = inferAll([{ a: 1 }, { a: 2, b: true }]);
  strictEqual(shape.fields.a.optional, false);
  strictEqual(shape.fields.b.optional, true);
  throws(() => inferAll([]), InputError);
});

test("non-finite numbers are rejected with the offending path", () => {
  throws(() => infer({ price: Infinity }), /\/price/);
  throws(() => infer(NaN), InputError);
});

test("non-JSON values are rejected (undefined, functions, class instances)", () => {
  throws(() => infer(undefined), InputError);
  throws(() => infer(() => 1), InputError);
  throws(() => infer(new Date()), InputError);
});
