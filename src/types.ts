/**
 * Core data model: JSON values, inferred shapes, tolerance rules,
 * drift issues and pin files. Everything here is plain data — the
 * whole engine is serializable, diffable and deterministic.
 */

/** Any value that can come out of `JSON.parse`. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Base class for every error shapepin raises on purpose. */
export class ShapepinError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShapepinError";
  }
}

/** A malformed pin file, tolerance rule or input payload. */
export class InputError extends ShapepinError {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

/** String formats shapepin detects and pins. */
export type StringFormat =
  | "uuid"
  | "iso-date-time"
  | "iso-date"
  | "email"
  | "url";

/** The fixed, deterministic ordering of shape kinds inside unions. */
export const KIND_ORDER = [
  "null",
  "boolean",
  "number",
  "string",
  "array",
  "object",
  "any",
] as const;

export type ShapeKind = (typeof KIND_ORDER)[number] | "union";

export interface NullShape {
  kind: "null";
}

export interface BooleanShape {
  kind: "boolean";
}

export interface NumberShape {
  kind: "number";
  /** True when every observed value was a mathematical integer. */
  integer: boolean;
}

export interface StringShape {
  kind: "string";
  /** Format shared by every observed value, or null when none/mixed. */
  format: StringFormat | null;
  /**
   * Sorted distinct observed values while the field is still an enum
   * candidate; null once the vocabulary grew past the tracking cap.
   */
  values: string[] | null;
  /** How many string values were observed at this path in total. */
  hits: number;
}

export interface ArrayShape {
  kind: "array";
  /** Merged shape of every observed element; null if only [] was seen. */
  items: Shape | null;
}

export interface ObjectField {
  shape: Shape;
  /** True when at least one pinned example omitted this key. */
  optional: boolean;
}

export interface ObjectShape {
  kind: "object";
  fields: { [key: string]: ObjectField };
}

/**
 * A value that took different JSON types across examples. Variants
 * are unique per kind and sorted by KIND_ORDER; a "null" variant is
 * how nullability is represented.
 */
export interface UnionShape {
  kind: "union";
  variants: Shape[];
}

/** Explicitly unconstrained — produced only by an `any` tolerance. */
export interface AnyShape {
  kind: "any";
}

export type Shape =
  | NullShape
  | BooleanShape
  | NumberShape
  | StringShape
  | ArrayShape
  | ObjectShape
  | UnionShape
  | AnyShape;

/** Tolerance rule kinds, applied per path pattern. */
export type ToleranceRule =
  | "optional" // the field may be absent
  | "nullable" // the value may be null
  | "any" // ignore the whole subtree
  | "open-enum" // strings outside the observed vocabulary are fine
  | "open-format" // strings breaking the pinned format are fine
  | "number" // floats are fine where only integers were observed
  | "extra-fields"; // unknown keys under this object are fine

export const TOLERANCE_RULES: readonly ToleranceRule[] = [
  "optional",
  "nullable",
  "any",
  "open-enum",
  "open-format",
  "number",
  "extra-fields",
];

export interface Tolerance {
  // Path pattern, e.g. "/orders/*/note" or "/**/updatedAt".
  path: string;
  rule: ToleranceRule;
}

/** Everything a `<name>.pin.json` file stores. */
export interface Pin {
  name: string;
  /** How many captured examples this shape was inferred from. */
  examples: number;
  tolerances: Tolerance[];
  shape: Shape;
}

/** Kinds of drift `check` can report. */
export type IssueKind =
  | "missing-field"
  | "new-field"
  | "type-changed"
  | "null-value"
  | "new-enum-value"
  | "format-changed"
  | "number-widened";

export interface DriftIssue {
  /** Concrete path into the payload, e.g. "/orders/2/items/0/price". */
  path: string;
  kind: IssueKind;
  /** Human-readable one-liner explaining the drift. */
  message: string;
}

/** Distinct string values tracked per path before the enum candidate is dropped. */
export const VALUE_TRACK_CAP = 20;

/** Maximum vocabulary size that can lock as an enum. */
export const ENUM_MAX = 8;
