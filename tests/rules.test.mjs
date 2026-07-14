// Tolerance path patterns: the glob-like matcher and its validation.
// A pattern typo must fail the run, never silently tolerate nothing.
import { deepStrictEqual, strictEqual, throws } from "node:assert";
import { test } from "node:test";
import {
  InputError,
  matchPath,
  parseTolerance,
  RuleSet,
  sortTolerances,
  validatePattern,
} from "../dist/index.js";

test("literal patterns match exactly and nothing else", () => {
  strictEqual(matchPath("/orders/0/status", "/orders/0/status"), true);
  strictEqual(matchPath("/orders/0/status", "/orders/1/status"), false);
  strictEqual(matchPath("/orders/0/status", "/orders/0"), false);
  strictEqual(matchPath("/orders/0", "/orders/0/status"), false);
});

test("* matches exactly one segment, including array indices", () => {
  strictEqual(matchPath("/orders/*/status", "/orders/7/status"), true);
  strictEqual(matchPath("/orders/*/status", "/orders/status"), false);
  strictEqual(matchPath("/orders/*/status", "/orders/7/items/status"), false);
});

test("** matches any run of segments, including none", () => {
  strictEqual(matchPath("/**/updatedAt", "/updatedAt"), true);
  strictEqual(matchPath("/**/updatedAt", "/a/b/c/updatedAt"), true);
  strictEqual(matchPath("/**/updatedAt", "/a/b/updatedAtX"), false);
  strictEqual(matchPath("/orders/**", "/orders"), true);
  strictEqual(matchPath("/orders/**", "/orders/1/items/0/sku"), true);
  // The root path ("") is matched by "/" and by "/**".
  strictEqual(matchPath("/", ""), true);
  strictEqual(matchPath("/**", ""), true);
  strictEqual(matchPath("/a", ""), false);
});

test("** composes with trailing literals and *", () => {
  strictEqual(matchPath("/**/items/*/price", "/orders/3/items/0/price"), true);
  strictEqual(matchPath("/**/items/*/price", "/items/9/price"), true);
  strictEqual(matchPath("/**/items/*/price", "/orders/3/items/price"), false);
});

test("malformed patterns are rejected: no slash, empty or embedded-* segments", () => {
  throws(() => validatePattern("orders/*/status"), InputError);
  throws(() => validatePattern("/orders//status"), InputError);
  throws(() => validatePattern("/orders/sta*us"), InputError);
});

test("parseTolerance splits on the last equals sign and validates both halves", () => {
  deepStrictEqual(parseTolerance("/orders/*/note=optional"), {
    path: "/orders/*/note",
    rule: "optional",
  });
  throws(() => parseTolerance("/orders/note"), /--tolerate expects/);
  throws(() => parseTolerance("/orders/note=frobnicate"), /unknown tolerance rule/);
});

test("RuleSet answers per rule kind, not per pattern", () => {
  const rules = new RuleSet([
    { path: "/a/*", rule: "nullable" },
    { path: "/b", rule: "optional" },
  ]);
  strictEqual(rules.has("nullable", "/a/x"), true);
  strictEqual(rules.has("optional", "/a/x"), false);
  strictEqual(rules.has("optional", "/b"), true);
  strictEqual(rules.has("any", "/b"), false);
});

test("RuleSet rejects invalid tolerances at construction time", () => {
  throws(() => new RuleSet([{ path: "bad", rule: "optional" }]), InputError);
  throws(() => new RuleSet([{ path: "/ok", rule: "nope" }]), InputError);
});

test("sortTolerances orders by path then rule, non-destructively", () => {
  const input = [
    { path: "/b", rule: "optional" },
    { path: "/a", rule: "nullable" },
    { path: "/a", rule: "any" },
  ];
  const sorted = sortTolerances(input);
  deepStrictEqual(
    sorted.map((t) => `${t.path}=${t.rule}`),
    ["/a=any", "/a=nullable", "/b=optional"],
  );
  // The original array is untouched.
  strictEqual(input[0].path, "/b");
});
