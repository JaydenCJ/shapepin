/**
 * Human-readable shape rendering for `shapepin show`: a compact,
 * TypeScript-flavoured signature that a reviewer can read top to
 * bottom. Rendering is display-only — the pin file stays the source
 * of truth.
 */
import { enumOf } from "./merge.js";
import type { Shape } from "./types.js";

const INDENT = "  ";

function isMultiline(shape: Shape): boolean {
  if (shape.kind === "object") return Object.keys(shape.fields).length > 0;
  if (shape.kind === "array") return shape.items !== null && isMultiline(shape.items);
  if (shape.kind === "union") return shape.variants.some(isMultiline);
  return false;
}

function renderScalar(shape: Shape): string {
  switch (shape.kind) {
    case "null":
      return "null";
    case "boolean":
      return "boolean";
    case "any":
      return "any";
    case "number":
      return shape.integer ? "number (integer)" : "number";
    case "string": {
      const vocabulary = enumOf(shape);
      if (vocabulary !== null) {
        return vocabulary.map((v) => JSON.stringify(v)).join(" | ");
      }
      return shape.format !== null ? `string (${shape.format})` : "string";
    }
    default:
      return shape.kind;
  }
}

function render(shape: Shape, depth: number): string {
  const pad = INDENT.repeat(depth);
  switch (shape.kind) {
    case "object": {
      const keys = Object.keys(shape.fields).sort();
      if (keys.length === 0) return "{}";
      const lines = keys.map((key) => {
        const field = shape.fields[key];
        if (field === undefined) return "";
        const mark = field.optional ? "?" : "";
        return `${pad}${INDENT}${key}${mark}: ${render(field.shape, depth + 1)}`;
      });
      return `{\n${lines.join("\n")}\n${pad}}`;
    }
    case "array": {
      if (shape.items === null) return "[] (always empty so far)";
      if (isMultiline(shape.items)) {
        return `array of ${render(shape.items, depth)}`;
      }
      const inner = render(shape.items, depth);
      // Unions and enums need parentheses to read as element types.
      return inner.includes(" | ") ? `(${inner})[]` : `${inner}[]`;
    }
    case "union":
      return shape.variants.map((v) => render(v, depth)).join(" | ");
    default:
      return renderScalar(shape);
  }
}

/** Render a shape as an indented, TypeScript-ish signature. */
export function renderShape(shape: Shape): string {
  return render(shape, 0);
}
