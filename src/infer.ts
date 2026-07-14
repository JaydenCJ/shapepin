/**
 * Shape inference: turn one captured JSON value into a Shape tree.
 * Inference is total over JSON — anything `JSON.parse` can produce
 * gets a shape — and rejects everything else loudly, because a shape
 * silently inferred from `undefined` or `NaN` would pin garbage.
 */
import { mergeShapes } from "./merge.js";
import {
  InputError,
  type JsonValue,
  type ObjectField,
  type Shape,
} from "./types.js";
import { detectFormat } from "./formats.js";

function describe(value: unknown): string {
  if (value === undefined) return "undefined";
  if (typeof value === "number") return String(value);
  if (typeof value === "function") return "a function";
  if (typeof value === "bigint") return "a bigint";
  if (typeof value === "symbol") return "a symbol";
  return Object.prototype.toString.call(value);
}

/** Infer the shape of a single example value. */
export function infer(value: JsonValue, path = ""): Shape {
  if (value === null) return { kind: "null" };
  switch (typeof value) {
    case "boolean":
      return { kind: "boolean" };
    case "number":
      if (!Number.isFinite(value)) {
        throw new InputError(
          `non-finite number at ${path || "(root)"}: ${describe(value)}`,
        );
      }
      return { kind: "number", integer: Number.isInteger(value) };
    case "string":
      return {
        kind: "string",
        format: detectFormat(value),
        values: [value],
        hits: 1,
      };
    case "object":
      break;
    default:
      throw new InputError(
        `not a JSON value at ${path || "(root)"}: ${describe(value)}`,
      );
  }
  if (Array.isArray(value)) {
    let items: Shape | null = null;
    for (let i = 0; i < value.length; i++) {
      const element = infer(value[i] as JsonValue, `${path}/${i}`);
      items = items === null ? element : mergeShapes(items, element);
    }
    return { kind: "array", items };
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new InputError(
      `not a plain JSON object at ${path || "(root)"}: ${describe(value)}`,
    );
  }
  const fields: { [key: string]: ObjectField } = {};
  for (const key of Object.keys(value).sort()) {
    const child = (value as { [key: string]: JsonValue })[key];
    if (child === undefined) continue; // mirror JSON.stringify semantics
    fields[key] = { shape: infer(child, `${path}/${key}`), optional: false };
  }
  return { kind: "object", fields };
}

/** Fold one more captured example into an existing shape. */
export function mergeExample(shape: Shape, value: JsonValue): Shape {
  return mergeShapes(shape, infer(value));
}

/** Infer a shape from one or more examples (at least one required). */
export function inferAll(examples: JsonValue[]): Shape {
  if (examples.length === 0) {
    throw new InputError("cannot infer a shape from zero examples");
  }
  let shape = infer(examples[0] as JsonValue);
  for (const example of examples.slice(1)) {
    shape = mergeExample(shape, example);
  }
  return shape;
}
