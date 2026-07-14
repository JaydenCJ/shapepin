// The drift checker: every issue kind, every tolerance rule, and the
// guarantee that one bad field never hides another.
import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";
import { checkValue, infer, inferAll } from "../dist/index.js";

/** Shorthand: check `value` against the shape inferred from `examples`. */
function drift(examples, value, tolerances = []) {
  return checkValue(value, inferAll(examples), tolerances);
}

test("a payload identical to the examples is clean", () => {
  const example = { id: 1, name: "a", tags: ["x"], meta: null };
  deepStrictEqual(drift([example], example), []);
});

test("missing required field is reported; observed-optional fields may be absent", () => {
  const issues = drift([{ a: 1, b: 2 }], { a: 1 });
  strictEqual(issues.length, 1);
  strictEqual(issues[0].kind, "missing-field");
  strictEqual(issues[0].path, "/b");
  deepStrictEqual(drift([{ a: 1, b: 2 }, { a: 1 }], { a: 5 }), []);
});

test("unknown fields are reported as new-field", () => {
  const issues = drift([{ a: 1 }], { a: 1, b: 2 });
  strictEqual(issues[0].kind, "new-field");
  strictEqual(issues[0].path, "/b");
});

test("type changes carry a truncated preview of the offending value", () => {
  const issues = drift([{ price: 9.5 }], { price: "9.50" });
  strictEqual(issues[0].kind, "type-changed");
  strictEqual(issues[0].path, "/price");
  strictEqual(issues[0].message.includes('"9.50"'), true);
  const long = drift([{ a: 1 }], { a: "x".repeat(200) });
  strictEqual(long[0].message.length < 120, true);
  strictEqual(long[0].message.includes("..."), true);
});

test("null where the examples never had null is null-value drift", () => {
  const issues = drift([{ a: "x" }], { a: null });
  strictEqual(issues[0].kind, "null-value");
});

test("null is fine when an example contained null (union with null)", () => {
  deepStrictEqual(drift([{ a: "x" }, { a: null }], { a: null }), []);
  deepStrictEqual(drift([{ a: "x" }, { a: null }], { a: "y" }), []);
});

test("a float where only integers were observed is number-widened; the reverse is fine", () => {
  const issues = drift([{ n: 1 }, { n: 2 }], { n: 2.5 });
  strictEqual(issues[0].kind, "number-widened");
  deepStrictEqual(drift([{ n: 1.5 }], { n: 3 }), []);
});

test("values outside a locked enum drift; open strings accept anything", () => {
  const examples = [{ s: "on" }, { s: "off" }, { s: "on" }];
  const issues = drift(examples, { s: "standby" });
  strictEqual(issues[0].kind, "new-enum-value");
  strictEqual(issues[0].message.includes('"off" | "on"'), true);
  // No repetition → no lock → no drift.
  deepStrictEqual(drift([{ s: "Alice" }, { s: "Bob" }], { s: "Carol" }), []);
});

test("a pinned format flags values that stop matching it", () => {
  const examples = [
    { at: "2026-06-28T09:14:03Z" },
    { at: "2026-07-01T08:05:59Z" },
  ];
  const issues = drift(examples, { at: "yesterday" });
  strictEqual(issues[0].kind, "format-changed");
  deepStrictEqual(drift(examples, { at: "2026-07-02T00:00:00Z" }), []);
});

test("array elements are checked individually; always-empty arrays accept anything", () => {
  const issues = drift([{ xs: [1, 2] }], { xs: [1, "two", 3.5] });
  deepStrictEqual(
    issues.map((i) => `${i.path}:${i.kind}`),
    ["/xs/1:type-changed", "/xs/2:number-widened"],
  );
  deepStrictEqual(drift([{ xs: [] }], { xs: [1, "mixed", null] }), []);
});

test("union type mismatches name every pinned alternative", () => {
  const issues = drift([{ v: "x" }, { v: 1 }], { v: true });
  strictEqual(issues[0].kind, "type-changed");
  strictEqual(issues[0].message.includes("integer | string"), true);
});

test("multiple issues surface together in deterministic order", () => {
  const examples = [{ a: 1, b: "x", c: true }];
  const issues = drift(examples, { a: "one", c: 1, d: [] });
  deepStrictEqual(
    issues.map((i) => i.path),
    ["/a", "/b", "/c", "/d"],
  );
});

test("a top-level type change reports at the root path", () => {
  const issues = checkValue([1, 2], infer({ a: 1 }));
  strictEqual(issues[0].path, "");
  strictEqual(issues[0].kind, "type-changed");
});

// --- tolerance rules ------------------------------------------------------

test("optional tolerance silences a missing required field", () => {
  const t = [{ path: "/b", rule: "optional" }];
  deepStrictEqual(drift([{ a: 1, b: 2 }], { a: 1 }, t), []);
});

test("nullable tolerance permits null at the matched path only", () => {
  const t = [{ path: "/a", rule: "nullable" }];
  deepStrictEqual(drift([{ a: "x", b: "y" }], { a: null, b: "y" }, t), []);
  strictEqual(drift([{ a: "x", b: "y" }], { a: "x", b: null }, t).length, 1);
});

test("any tolerance ignores the whole subtree", () => {
  const t = [{ path: "/meta", rule: "any" }];
  const payload = { id: 1, meta: { totally: ["different", 1, null] } };
  deepStrictEqual(drift([{ id: 1, meta: { v: 1 } }], payload, t), []);
});

test("open-enum and open-format tolerances relax string constraints", () => {
  const closed = [{ s: "on" }, { s: "off" }, { s: "on" }];
  const openEnum = [{ path: "/s", rule: "open-enum" }];
  deepStrictEqual(drift(closed, { s: "standby" }, openEnum), []);
  const dated = [{ at: "2026-06-28" }, { at: "2026-06-29" }];
  const openFormat = [{ path: "/at", rule: "open-format" }];
  deepStrictEqual(drift(dated, { at: "someday" }, openFormat), []);
});

test("number tolerance admits floats where integers were pinned", () => {
  const t = [{ path: "/n", rule: "number" }];
  deepStrictEqual(drift([{ n: 1 }, { n: 2 }], { n: 2.5 }, t), []);
});

test("extra-fields tolerance targets the object, not the new key", () => {
  const t = [{ path: "/user", rule: "extra-fields" }];
  const examples = [{ user: { id: 1 } }];
  deepStrictEqual(drift(examples, { user: { id: 1, nick: "d" } }, t), []);
  // The same rule on the key path would not help — documented behavior.
  const wrong = [{ path: "/user/nick", rule: "extra-fields" }];
  strictEqual(drift(examples, { user: { id: 1, nick: "d" } }, wrong).length, 1);
});

test("wildcard and /** tolerances apply across array indices and depths", () => {
  const examples = [{ xs: [{ n: 1 }, { n: 2 }] }];
  const t = [{ path: "/xs/*/n", rule: "number" }];
  deepStrictEqual(drift(examples, { xs: [{ n: 1.5 }, { n: 2.5 }] }, t), []);
  const deep = [
    { a: { updatedAt: "x" }, updatedAt: "y" },
    { a: { updatedAt: "x" }, updatedAt: "y" },
  ];
  const blanket = [{ path: "/**/updatedAt", rule: "open-enum" }];
  deepStrictEqual(
    drift(deep, { a: { updatedAt: "new" }, updatedAt: "newer" }, blanket),
    [],
  );
});
