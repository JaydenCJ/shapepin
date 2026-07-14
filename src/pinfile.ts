/**
 * Pin file (de)serialization. The on-disk format is versioned JSON
 * with a fixed key order, sorted object fields and sorted tolerances,
 * so re-pinning from the same captures is byte-identical and the git
 * diff of a pin file IS the contract change. Readers reject versions
 * they do not understand instead of guessing.
 */
import {
  InputError,
  KIND_ORDER,
  type ObjectField,
  type Pin,
  type Shape,
  type StringFormat,
  type Tolerance,
} from "./types.js";
import { sortTolerances, validatePattern, validateRule } from "./rules.js";

export const PIN_FORMAT_VERSION = 1;

/** Pin names double as file names; keep them boring on purpose. */
export function validatePinName(name: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
    throw new InputError(
      `invalid pin name ${JSON.stringify(name)} (use letters, digits, ".", "_", "-")`,
    );
  }
  return name;
}

// --- serialization -------------------------------------------------------

const STRING_FORMATS: readonly StringFormat[] = [
  "uuid",
  "iso-date-time",
  "iso-date",
  "email",
  "url",
];

/** Rebuild a shape with canonical key order and sorted collections. */
function canonicalShape(shape: Shape): unknown {
  switch (shape.kind) {
    case "null":
    case "boolean":
    case "any":
      return { kind: shape.kind };
    case "number":
      return { kind: "number", integer: shape.integer };
    case "string": {
      const out: Record<string, unknown> = { kind: "string" };
      if (shape.format !== null) out.format = shape.format;
      if (shape.values !== null) out.values = [...shape.values].sort();
      out.hits = shape.hits;
      return out;
    }
    case "array":
      return {
        kind: "array",
        items: shape.items === null ? null : canonicalShape(shape.items),
      };
    case "object": {
      const fields: Record<string, unknown> = {};
      for (const key of Object.keys(shape.fields).sort()) {
        const field = shape.fields[key] as ObjectField;
        const entry: Record<string, unknown> = {};
        if (field.optional) entry.optional = true;
        entry.shape = canonicalShape(field.shape);
        fields[key] = entry;
      }
      return { kind: "object", fields };
    }
    case "union": {
      const rank = (s: Shape) =>
        KIND_ORDER.indexOf(s.kind as (typeof KIND_ORDER)[number]);
      const variants = [...shape.variants]
        .sort((a, b) => rank(a) - rank(b))
        .map(canonicalShape);
      return { kind: "union", variants };
    }
  }
}

/** Serialize a pin to its canonical on-disk text (trailing newline). */
export function serializePin(pin: Pin): string {
  const doc = {
    shapepin: PIN_FORMAT_VERSION,
    name: pin.name,
    examples: pin.examples,
    tolerances: sortTolerances(pin.tolerances),
    shape: canonicalShape(pin.shape),
  };
  return JSON.stringify(doc, null, 2) + "\n";
}

// --- parsing / validation ------------------------------------------------

function bad(where: string, why: string): never {
  throw new InputError(`invalid pin file: ${why} (at ${where || "shape root"})`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseShape(raw: unknown, where: string): Shape {
  if (!isRecord(raw)) bad(where, "shape node is not an object");
  const kind = raw.kind;
  switch (kind) {
    case "null":
    case "boolean":
    case "any":
      return { kind };
    case "number": {
      if (typeof raw.integer !== "boolean") bad(where, '"integer" must be a boolean');
      return { kind: "number", integer: raw.integer };
    }
    case "string": {
      let format: StringFormat | null = null;
      if (raw.format !== undefined) {
        if (!STRING_FORMATS.includes(raw.format as StringFormat)) {
          bad(where, `unknown string format ${JSON.stringify(raw.format)}`);
        }
        format = raw.format as StringFormat;
      }
      let values: string[] | null = null;
      if (raw.values !== undefined) {
        if (
          !Array.isArray(raw.values) ||
          raw.values.some((v) => typeof v !== "string")
        ) {
          bad(where, '"values" must be an array of strings');
        }
        values = [...(raw.values as string[])].sort();
      }
      if (typeof raw.hits !== "number" || !Number.isInteger(raw.hits) || raw.hits < 1) {
        bad(where, '"hits" must be a positive integer');
      }
      return { kind: "string", format, values, hits: raw.hits };
    }
    case "array": {
      if (!("items" in raw)) bad(where, 'array shape needs "items" (may be null)');
      const items =
        raw.items === null ? null : parseShape(raw.items, `${where}/items`);
      return { kind: "array", items };
    }
    case "object": {
      if (!isRecord(raw.fields)) bad(where, '"fields" must be an object');
      const fields: { [key: string]: ObjectField } = {};
      for (const key of Object.keys(raw.fields).sort()) {
        const entry = (raw.fields as Record<string, unknown>)[key];
        if (!isRecord(entry)) bad(`${where}/${key}`, "field entry is not an object");
        if (entry.optional !== undefined && typeof entry.optional !== "boolean") {
          bad(`${where}/${key}`, '"optional" must be a boolean');
        }
        fields[key] = {
          shape: parseShape(entry.shape, `${where}/${key}`),
          optional: entry.optional === true,
        };
      }
      return { kind: "object", fields };
    }
    case "union": {
      if (!Array.isArray(raw.variants) || raw.variants.length < 2) {
        bad(where, "union needs at least two variants");
      }
      const variants = raw.variants.map((v, i) =>
        parseShape(v, `${where}/variants/${i}`),
      );
      const kinds = new Set(variants.map((v) => v.kind));
      if (kinds.size !== variants.length || kinds.has("union")) {
        bad(where, "union variants must be distinct, non-union kinds");
      }
      return { kind: "union", variants };
    }
    default:
      bad(where, `unknown shape kind ${JSON.stringify(kind)}`);
  }
}

function parseTolerances(raw: unknown): Tolerance[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new InputError('invalid pin file: "tolerances" must be an array');
  }
  return raw.map((entry, i) => {
    if (!isRecord(entry) || typeof entry.path !== "string" || typeof entry.rule !== "string") {
      throw new InputError(
        `invalid pin file: tolerances[${i}] must be {"path", "rule"}`,
      );
    }
    validatePattern(entry.path);
    return { path: entry.path, rule: validateRule(entry.rule) };
  });
}

/** Parse and validate a pin file's text. */
export function parsePin(text: string): Pin {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new InputError(
      `invalid pin file: not JSON (${(err as Error).message})`,
    );
  }
  if (!isRecord(raw)) throw new InputError("invalid pin file: not an object");
  if (raw.shapepin !== PIN_FORMAT_VERSION) {
    throw new InputError(
      `unsupported pin format version ${JSON.stringify(raw.shapepin)} (this build reads version ${PIN_FORMAT_VERSION})`,
    );
  }
  if (typeof raw.name !== "string") {
    throw new InputError('invalid pin file: "name" must be a string');
  }
  validatePinName(raw.name);
  if (
    typeof raw.examples !== "number" ||
    !Number.isInteger(raw.examples) ||
    raw.examples < 1
  ) {
    throw new InputError('invalid pin file: "examples" must be a positive integer');
  }
  return {
    name: raw.name,
    examples: raw.examples,
    tolerances: parseTolerances(raw.tolerances),
    shape: parseShape(raw.shape, ""),
  };
}
