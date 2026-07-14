// Pin file serialization: byte-determinism, round-tripping, and loud
// rejection of malformed or future-versioned files.
import { deepStrictEqual, strictEqual, throws } from "node:assert";
import { test } from "node:test";
import {
  InputError,
  inferAll,
  parsePin,
  serializePin,
  validatePinName,
} from "../dist/index.js";

function makePin(examples, tolerances = []) {
  return {
    name: "orders",
    examples: examples.length,
    tolerances,
    shape: inferAll(examples),
  };
}

test("serialize → parse round-trips a realistic pin", () => {
  const pin = makePin(
    [
      { id: 1, tags: ["a"], meta: null },
      { id: 2.5, tags: [], extra: true },
    ],
    [{ path: "/meta", rule: "nullable" }],
  );
  deepStrictEqual(parsePin(serializePin(pin)), pin);
});

test("serialization is byte-deterministic and ends with one newline", () => {
  const a = serializePin(makePin([{ b: 1, a: "x" }, { a: "y", b: 2 }]));
  const b = serializePin(makePin([{ a: "y", b: 2 }, { b: 1, a: "x" }]));
  strictEqual(a, b);
  strictEqual(a.endsWith("}\n"), true);
  strictEqual(a.endsWith("\n\n"), false);
});

test("tolerances are sorted and object fields alphabetized on disk", () => {
  const pin = makePin(
    [{ z: 1, a: 2 }],
    [
      { path: "/z", rule: "optional" },
      { path: "/a", rule: "nullable" },
    ],
  );
  const text = serializePin(pin);
  strictEqual(text.indexOf('"/a"') < text.indexOf('"/z"'), true);
  const doc = JSON.parse(text);
  deepStrictEqual(Object.keys(doc.shape.fields), ["a", "z"]);
});

test("absent facts are omitted on disk: optional=false, no format, no values", () => {
  const doc = JSON.parse(serializePin(makePin([{ a: 1, b: 2 }, { a: 1 }])));
  strictEqual("optional" in doc.shape.fields.a, false);
  strictEqual(doc.shape.fields.b.optional, true);
  const open = JSON.parse(
    serializePin(makePin(Array.from({ length: 25 }, (_, i) => `v${i}`))),
  );
  strictEqual("values" in open.shape, false);
  strictEqual("format" in open.shape, false);
  strictEqual(open.shape.hits, 25);
});

test("a future format version is rejected, not guessed at", () => {
  const text = serializePin(makePin([{ a: 1 }])).replace(
    '"shapepin": 1',
    '"shapepin": 2',
  );
  throws(() => parsePin(text), /unsupported pin format version 2/);
});

test("non-JSON and non-object pin files fail with a clear message", () => {
  throws(() => parsePin("not json"), /not JSON/);
  throws(() => parsePin("[1,2]"), /not an object/);
});

test("structural damage is caught with the failing location", () => {
  const good = JSON.parse(serializePin(makePin([{ a: "x" }])));
  const noHits = structuredClone(good);
  delete noHits.shape.fields.a.shape.hits;
  throws(() => parsePin(JSON.stringify(noHits)), /"hits"/);

  const badKind = structuredClone(good);
  badKind.shape.fields.a.shape.kind = "wibble";
  throws(() => parsePin(JSON.stringify(badKind)), /unknown shape kind/);

  const badTolerance = structuredClone(good);
  badTolerance.tolerances = [{ path: "/a" }];
  throws(() => parsePin(JSON.stringify(badTolerance)), /tolerances\[0\]/);
});

test("unions must have distinct, non-union variant kinds", () => {
  const doc = JSON.parse(serializePin(makePin([{ a: "x" }, { a: null }])));
  strictEqual(doc.shape.fields.a.shape.kind, "union");
  const dupe = structuredClone(doc);
  dupe.shape.fields.a.shape.variants = [{ kind: "null" }, { kind: "null" }];
  throws(() => parsePin(JSON.stringify(dupe)), /distinct/);
});

test("pin names are restricted to filename-safe characters", () => {
  strictEqual(validatePinName("orders-v2.get"), "orders-v2.get");
  throws(() => validatePinName("../escape"), InputError);
  throws(() => validatePinName("a/b"), InputError);
  throws(() => validatePinName(""), InputError);
});
