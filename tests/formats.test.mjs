// String format detectors. False positives here would pin constraints
// an API never promised, so the negative cases matter more than the
// positive ones.
import { strictEqual } from "node:assert";
import { test } from "node:test";
import { detectFormat } from "../dist/index.js";

test("detects RFC 4122 UUIDs and rejects near-UUIDs", () => {
  strictEqual(detectFormat("7f9c24e5-2c31-4b13-9c67-cc5f1a0e12d4"), "uuid");
  strictEqual(detectFormat("7F9C24E5-2C31-4B13-9C67-CC5F1A0E12D4"), "uuid");
  // Bad variant nibble, missing dash, truncated.
  strictEqual(detectFormat("7f9c24e5-2c31-4b13-0c67-cc5f1a0e12d4"), null);
  strictEqual(detectFormat("7f9c24e52c31-4b13-9c67-cc5f1a0e12d4"), null);
  strictEqual(detectFormat("7f9c24e5-2c31-4b13-9c67"), null);
});

test("detects RFC 3339 date-times and prefers them over bare dates", () => {
  strictEqual(detectFormat("2026-06-28T09:14:03Z"), "iso-date-time");
  strictEqual(detectFormat("2026-06-28T09:14:03.250+09:00"), "iso-date-time");
});

test("rejects offset-less date-times, impossible dates and clock times", () => {
  // No offset → a local time → ambiguous → not pinned as a date-time.
  strictEqual(detectFormat("2026-06-28T09:14:03"), null);
  strictEqual(detectFormat("2026-13-01T00:00:00Z"), null);
  strictEqual(detectFormat("2026-02-30T00:00:00Z"), null);
  strictEqual(detectFormat("2026-06-28T24:00:00Z"), null);
  strictEqual(detectFormat("2026-06-28T09:60:00Z"), null);
});

test("detects bare ISO dates with calendar validation", () => {
  strictEqual(detectFormat("2026-02-29"), "iso-date");
  strictEqual(detectFormat("2026-02-30"), null);
});

test("detects plausible emails and rejects obvious non-emails", () => {
  strictEqual(detectFormat("dana@example.test"), "email");
  strictEqual(detectFormat("dana@example"), null);
  strictEqual(detectFormat("not an email"), null);
  strictEqual(detectFormat("two@@example.test"), null);
});

test("detects http(s) URLs only, and never with spaces", () => {
  strictEqual(detectFormat("https://example.test/orders?page=2"), "url");
  strictEqual(detectFormat("http://127.0.0.1:8080/health"), "url");
  strictEqual(detectFormat("ftp://example.test/file"), null);
  strictEqual(detectFormat("example.test/orders"), null);
  strictEqual(detectFormat("https://example.test/a b"), null);
});

test("plain words, numbers-as-strings and empty strings have no format", () => {
  strictEqual(detectFormat("shipped"), null);
  strictEqual(detectFormat("12345"), null);
  strictEqual(detectFormat(""), null);
});
