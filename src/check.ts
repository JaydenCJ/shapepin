/**
 * Drift checking: validate a live payload against a pinned shape and
 * a set of tolerance rules. The checker never throws on payload
 * content — every deviation becomes a DriftIssue with a concrete
 * path, so one bad field cannot hide the others.
 */
import { detectFormat } from "./formats.js";
import { enumOf } from "./merge.js";
import { RuleSet } from "./rules.js";
import type {
  DriftIssue,
  JsonValue,
  ObjectShape,
  Pin,
  Shape,
  StringShape,
  Tolerance,
  UnionShape,
} from "./types.js";

function valueKind(
  value: JsonValue,
): "null" | "boolean" | "number" | "string" | "array" | "object" {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value as "boolean" | "number" | "string" | "object";
}

/** A short, single-line preview of a payload value for messages. */
export function preview(value: JsonValue): string {
  const text = JSON.stringify(value);
  return text.length <= 48 ? text : text.slice(0, 45) + "...";
}

function shapeName(shape: Shape): string {
  if (shape.kind === "union") {
    return shape.variants.map(shapeName).join(" | ");
  }
  if (shape.kind === "number" && shape.integer) return "integer";
  if (shape.kind === "string") {
    const vocabulary = enumOf(shape);
    if (vocabulary !== null) {
      return vocabulary.map((v) => JSON.stringify(v)).join(" | ");
    }
  }
  return shape.kind;
}

function checkString(
  value: string,
  shape: StringShape,
  rules: RuleSet,
  path: string,
  issues: DriftIssue[],
): void {
  const vocabulary = enumOf(shape);
  if (vocabulary !== null) {
    if (!vocabulary.includes(value) && !rules.has("open-enum", path)) {
      issues.push({
        path,
        kind: "new-enum-value",
        message: `${preview(value)} is not one of ${vocabulary
          .map((v) => JSON.stringify(v))
          .join(" | ")}`,
      });
    }
    return;
  }
  if (shape.format !== null && detectFormat(value) !== shape.format) {
    if (!rules.has("open-format", path)) {
      issues.push({
        path,
        kind: "format-changed",
        message: `pinned ${shape.format} string, got ${preview(value)}`,
      });
    }
  }
}

function checkUnion(
  value: JsonValue,
  shape: UnionShape,
  rules: RuleSet,
  path: string,
  issues: DriftIssue[],
): void {
  const kind = valueKind(value);
  const variant = shape.variants.find((v) => v.kind === kind);
  if (variant) {
    walk(value, variant, rules, path, issues);
    return;
  }
  issues.push({
    path,
    kind: "type-changed",
    message: `pinned ${shapeName(shape)}, got ${kind} (${preview(value)})`,
  });
}

function checkObject(
  value: { [key: string]: JsonValue },
  shape: ObjectShape,
  rules: RuleSet,
  path: string,
  issues: DriftIssue[],
): void {
  for (const key of Object.keys(shape.fields).sort()) {
    const field = shape.fields[key];
    if (field === undefined) continue;
    const childPath = `${path}/${key}`;
    if (!(key in value)) {
      if (!field.optional && !rules.has("optional", childPath)) {
        issues.push({
          path: childPath,
          kind: "missing-field",
          message: `required field ${JSON.stringify(key)} is missing`,
        });
      }
      continue;
    }
    walk(value[key] as JsonValue, field.shape, rules, childPath, issues);
  }
  for (const key of Object.keys(value).sort()) {
    if (key in shape.fields) continue;
    if (rules.has("extra-fields", path)) continue;
    issues.push({
      path: `${path}/${key}`,
      kind: "new-field",
      message: `field ${JSON.stringify(key)} was never in a pinned example`,
    });
  }
}

function walk(
  value: JsonValue,
  shape: Shape,
  rules: RuleSet,
  path: string,
  issues: DriftIssue[],
): void {
  if (shape.kind === "any" || rules.has("any", path)) return;

  if (value === null) {
    const nullable =
      shape.kind === "null" ||
      (shape.kind === "union" && shape.variants.some((v) => v.kind === "null"));
    if (!nullable && !rules.has("nullable", path)) {
      issues.push({
        path,
        kind: "null-value",
        message: `pinned ${shapeName(shape)}, got null`,
      });
    }
    return;
  }

  if (shape.kind === "union") {
    checkUnion(value, shape, rules, path, issues);
    return;
  }

  const kind = valueKind(value);
  if (kind !== shape.kind) {
    issues.push({
      path,
      kind: "type-changed",
      message: `pinned ${shapeName(shape)}, got ${kind} (${preview(value)})`,
    });
    return;
  }

  switch (shape.kind) {
    case "boolean":
      return;
    case "number": {
      const n = value as number;
      if (shape.integer && !Number.isInteger(n) && !rules.has("number", path)) {
        issues.push({
          path,
          kind: "number-widened",
          message: `pinned integer, got ${preview(n)}`,
        });
      }
      return;
    }
    case "string":
      checkString(value as string, shape, rules, path, issues);
      return;
    case "array": {
      const items = shape.items;
      if (items === null) return; // only [] was ever pinned: nothing to hold new elements to
      const array = value as JsonValue[];
      for (let i = 0; i < array.length; i++) {
        walk(array[i] as JsonValue, items, rules, `${path}/${i}`, issues);
      }
      return;
    }
    case "object":
      checkObject(
        value as { [key: string]: JsonValue },
        shape,
        rules,
        path,
        issues,
      );
      return;
  }
}

/**
 * Check one payload against a shape. Issues come back in a stable
 * depth-first, key-sorted order — the same payload always produces
 * the same report.
 */
export function checkValue(
  value: JsonValue,
  shape: Shape,
  tolerances: Tolerance[] = [],
): DriftIssue[] {
  const issues: DriftIssue[] = [];
  walk(value, shape, new RuleSet(tolerances), "", issues);
  return issues;
}

/** Check one payload against a full pin. */
export function checkPin(pin: Pin, value: JsonValue): DriftIssue[] {
  return checkValue(value, pin.shape, pin.tolerances);
}
