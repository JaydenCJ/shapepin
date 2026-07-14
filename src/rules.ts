/**
 * Tolerance path patterns: a tiny, glob-like language over JSON paths.
 * Segments are separated by "/"; "*" matches exactly one segment (a
 * key or an array index), "**" matches any run of segments including
 * none. Patterns are validated when a pin is loaded so a typo in a
 * tolerance fails the run instead of silently tolerating nothing.
 */
import {
  InputError,
  TOLERANCE_RULES,
  type Tolerance,
  type ToleranceRule,
} from "./types.js";

/** Split a concrete path ("" is the root) into its segments. */
export function pathSegments(path: string): string[] {
  if (path === "" || path === "/") return [];
  return path.replace(/^\//, "").split("/");
}

/** Validate a pattern string, throwing InputError with a reason. */
export function validatePattern(pattern: string): void {
  if (pattern !== "/" && !pattern.startsWith("/")) {
    throw new InputError(
      `tolerance path ${JSON.stringify(pattern)} must start with "/"`,
    );
  }
  for (const segment of pathSegments(pattern)) {
    if (segment === "") {
      throw new InputError(
        `tolerance path ${JSON.stringify(pattern)} has an empty segment`,
      );
    }
    if (segment.includes("*") && segment !== "*" && segment !== "**") {
      throw new InputError(
        `tolerance path ${JSON.stringify(pattern)}: "*" must be a whole segment`,
      );
    }
  }
}

/** Validate a rule name, narrowing the type. */
export function validateRule(rule: string): ToleranceRule {
  if ((TOLERANCE_RULES as readonly string[]).includes(rule)) {
    return rule as ToleranceRule;
  }
  throw new InputError(
    `unknown tolerance rule ${JSON.stringify(rule)} (expected one of: ${TOLERANCE_RULES.join(", ")})`,
  );
}

/**
 * Parse "<pattern>=<rule>" (the CLI's --tolerate syntax) into a
 * validated Tolerance.
 */
export function parseTolerance(spec: string): Tolerance {
  const eq = spec.lastIndexOf("=");
  if (eq === -1) {
    throw new InputError(
      `--tolerate expects "<path>=<rule>", got ${JSON.stringify(spec)}`,
    );
  }
  const path = spec.slice(0, eq).trim();
  const rule = validateRule(spec.slice(eq + 1).trim());
  validatePattern(path);
  return { path, rule };
}

function matchSegments(pattern: string[], path: string[]): boolean {
  // Classic recursive glob matching with the "**" shortcut. Pattern
  // and path lists are short (JSON nesting depth), so no memo needed.
  if (pattern.length === 0) return path.length === 0;
  const head = pattern[0] as string;
  if (head === "**") {
    // "**" absorbs 0..n leading path segments.
    for (let skip = 0; skip <= path.length; skip++) {
      if (matchSegments(pattern.slice(1), path.slice(skip))) return true;
    }
    return false;
  }
  if (path.length === 0) return false;
  if (head !== "*" && head !== path[0]) return false;
  return matchSegments(pattern.slice(1), path.slice(1));
}

/** Does a pattern match a concrete payload path? */
export function matchPath(pattern: string, path: string): boolean {
  return matchSegments(pathSegments(pattern), pathSegments(path));
}

/** A fast rule lookup built once per check run. */
export class RuleSet {
  private readonly byRule: Map<ToleranceRule, string[]>;

  constructor(tolerances: Tolerance[]) {
    this.byRule = new Map();
    for (const t of tolerances) {
      validatePattern(t.path);
      validateRule(t.rule);
      const list = this.byRule.get(t.rule) ?? [];
      list.push(t.path);
      this.byRule.set(t.rule, list);
    }
  }

  /** Is `rule` tolerated at this concrete path? */
  has(rule: ToleranceRule, path: string): boolean {
    const patterns = this.byRule.get(rule);
    if (!patterns) return false;
    return patterns.some((pattern) => matchPath(pattern, path));
  }
}

/** Deterministic ordering for tolerances inside a pin file. */
export function sortTolerances(tolerances: Tolerance[]): Tolerance[] {
  return [...tolerances].sort((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    if (a.rule !== b.rule) return a.rule < b.rule ? -1 : 1;
    return 0;
  });
}
