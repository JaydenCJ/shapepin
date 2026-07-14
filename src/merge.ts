/**
 * Shape merging: combine what two sets of examples proved into one
 * shape. Merging is commutative and associative in effect, so the
 * order captures are fed to `pin` never changes the resulting pin —
 * determinism here is what makes pin files diffable in git.
 */
import {
  ENUM_MAX,
  KIND_ORDER,
  VALUE_TRACK_CAP,
  type ArrayShape,
  type NumberShape,
  type ObjectField,
  type ObjectShape,
  type Shape,
  type StringShape,
  type UnionShape,
} from "./types.js";

function mergeStrings(a: StringShape, b: StringShape): StringShape {
  let values: string[] | null = null;
  if (a.values !== null && b.values !== null) {
    const set = new Set([...a.values, ...b.values]);
    values = set.size <= VALUE_TRACK_CAP ? [...set].sort() : null;
  }
  return {
    kind: "string",
    format: a.format !== null && a.format === b.format ? a.format : null,
    values,
    hits: a.hits + b.hits,
  };
}

function mergeNumbers(a: NumberShape, b: NumberShape): NumberShape {
  return { kind: "number", integer: a.integer && b.integer };
}

function mergeArrays(a: ArrayShape, b: ArrayShape): ArrayShape {
  let items: Shape | null;
  if (a.items === null) items = b.items;
  else if (b.items === null) items = a.items;
  else items = mergeShapes(a.items, b.items);
  return { kind: "array", items };
}

function mergeObjects(a: ObjectShape, b: ObjectShape): ObjectShape {
  const fields: { [key: string]: ObjectField } = {};
  const keys = [...new Set([...Object.keys(a.fields), ...Object.keys(b.fields)])].sort();
  for (const key of keys) {
    const left = a.fields[key];
    const right = b.fields[key];
    if (left && right) {
      fields[key] = {
        shape: mergeShapes(left.shape, right.shape),
        optional: left.optional || right.optional,
      };
    } else {
      // Present on one side only: the field is provably optional.
      const only = (left ?? right) as ObjectField;
      fields[key] = { shape: only.shape, optional: true };
    }
  }
  return { kind: "object", fields };
}

function mergeSameKind(a: Shape, b: Shape): Shape {
  switch (a.kind) {
    case "null":
    case "boolean":
    case "any":
      return { kind: a.kind };
    case "number":
      return mergeNumbers(a, b as NumberShape);
    case "string":
      return mergeStrings(a, b as StringShape);
    case "array":
      return mergeArrays(a, b as ArrayShape);
    case "object":
      return mergeObjects(a, b as ObjectShape);
    case "union":
      // Handled by the variant grouping in mergeShapes.
      throw new Error("unreachable: union merged as same-kind");
  }
}

function variantsOf(shape: Shape): Shape[] {
  return shape.kind === "union" ? shape.variants : [shape];
}

function kindRank(shape: Shape): number {
  return KIND_ORDER.indexOf(shape.kind as (typeof KIND_ORDER)[number]);
}

/**
 * Merge two shapes into the narrowest shape consistent with both.
 * Same-kind shapes merge structurally; different kinds form a union
 * with one variant per kind, sorted by KIND_ORDER. `any` absorbs
 * everything.
 */
export function mergeShapes(a: Shape, b: Shape): Shape {
  if (a.kind === "any" || b.kind === "any") return { kind: "any" };
  if (a.kind !== "union" && a.kind === b.kind) return mergeSameKind(a, b);

  const byKind = new Map<string, Shape>();
  for (const variant of [...variantsOf(a), ...variantsOf(b)]) {
    if (variant.kind === "any") return { kind: "any" };
    const existing = byKind.get(variant.kind);
    byKind.set(
      variant.kind,
      existing ? mergeSameKind(existing, variant) : variant,
    );
  }
  const variants = [...byKind.values()].sort((x, y) => kindRank(x) - kindRank(y));
  if (variants.length === 1) return variants[0] as Shape;
  return { kind: "union", variants };
}

/**
 * The locked vocabulary of a string shape, or null when the string is
 * open. A vocabulary locks only when it is small (≤ ENUM_MAX), has no
 * detected format (a set of two UUIDs is a coincidence, not an enum)
 * and at least one value repeated across observations — repetition is
 * the signal that the set is closed. A single example can never lock.
 */
export function enumOf(shape: StringShape): string[] | null {
  if (shape.values === null || shape.format !== null) return null;
  if (shape.values.length > ENUM_MAX) return null;
  if (shape.values.length >= shape.hits) return null;
  return shape.values;
}
