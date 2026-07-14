// The `show` renderer: shapes read as TypeScript-ish signatures.
import { strictEqual } from "node:assert";
import { test } from "node:test";
import { inferAll, renderShape } from "../dist/index.js";

test("scalars render with their qualifiers; nullables as unions", () => {
  strictEqual(renderShape(inferAll([1, 2])), "number (integer)");
  strictEqual(renderShape(inferAll([1.5])), "number");
  strictEqual(renderShape(inferAll([true])), "boolean");
  strictEqual(
    renderShape(inferAll(["dana@example.test", "lee@example.test"])),
    "string (email)",
  );
  strictEqual(renderShape(inferAll(["x", null])), "null | string");
});

test("locked enums render as quoted alternatives", () => {
  strictEqual(renderShape(inferAll(["on", "off", "on"])), '"off" | "on"');
});

test("objects render one sorted field per line with ? for optional", () => {
  const shape = inferAll([{ b: 1, a: "x" }, { a: "y" }]);
  strictEqual(renderShape(shape), "{\n  a: string\n  b?: number (integer)\n}");
});

test("nested objects indent consistently", () => {
  const shape = inferAll([{ user: { id: 1 } }]);
  strictEqual(
    renderShape(shape),
    "{\n  user: {\n    id: number (integer)\n  }\n}",
  );
});

test("arrays of scalars use [], unions get parentheses, empty ones say so", () => {
  strictEqual(renderShape(inferAll([[1, 2]])), "number (integer)[]");
  strictEqual(renderShape(inferAll([[1, "a"]])), "(number (integer) | string)[]");
  strictEqual(renderShape(inferAll([[]])), "[] (always empty so far)");
});

test("arrays of objects read as 'array of { … }'", () => {
  const shape = inferAll([{ xs: [{ n: 1 }] }]);
  strictEqual(
    renderShape(shape),
    "{\n  xs: array of {\n    n: number (integer)\n  }\n}",
  );
});
