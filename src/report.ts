/**
 * Report rendering for `check`: an aligned, per-payload text report
 * and a stable JSON document for machines. Both are pure functions of
 * their inputs — same pin, same payloads, byte-identical report.
 */
import type { DriftIssue, Pin } from "./types.js";
import { VERSION } from "./version.js";

export interface PayloadResult {
  /** Display name of the payload source (file path or "stdin"). */
  source: string;
  issues: DriftIssue[];
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function pinLabel(pin: Pin): string {
  return `pin "${pin.name}" (${plural(pin.examples, "example")}, ${plural(
    pin.tolerances.length,
    "tolerance",
  )})`;
}

/** Render the human-readable check report. */
export function renderCheckReport(pin: Pin, results: PayloadResult[]): string {
  const lines: string[] = [];
  let drifted = 0;
  let issueCount = 0;
  for (const result of results) {
    if (result.issues.length === 0) {
      lines.push(`✓ ${result.source}`);
      continue;
    }
    drifted++;
    issueCount += result.issues.length;
    lines.push(
      `✗ ${result.source} — ${plural(result.issues.length, "drift issue")}`,
    );
    const pathWidth = Math.max(
      ...result.issues.map((i) => displayPath(i.path).length),
    );
    const kindWidth = Math.max(...result.issues.map((i) => i.kind.length));
    for (const issue of result.issues) {
      lines.push(
        `  ${displayPath(issue.path).padEnd(pathWidth)}  ${issue.kind.padEnd(kindWidth)}  ${issue.message}`,
      );
    }
  }
  const clean = results.length - drifted;
  lines.push(
    `${clean} clean, ${drifted} drifted, ${plural(issueCount, "issue")} · ${pinLabel(pin)}`,
  );
  return lines.join("\n");
}

/** The root path renders as "(root)" so reports never show an empty cell. */
export function displayPath(path: string): string {
  return path === "" ? "(root)" : path;
}

/** Build the machine-readable check document (for --json). */
export function checkReportJson(
  pin: Pin,
  results: PayloadResult[],
): Record<string, unknown> {
  const drifted = results.filter((r) => r.issues.length > 0).length;
  return {
    tool: "shapepin",
    version: VERSION,
    ok: drifted === 0,
    pin: {
      name: pin.name,
      examples: pin.examples,
      tolerances: pin.tolerances.length,
    },
    payloads: results.map((r) => ({
      source: r.source,
      ok: r.issues.length === 0,
      issues: r.issues.map((i) => ({
        path: i.path,
        kind: i.kind,
        message: i.message,
      })),
    })),
    summary: {
      clean: results.length - drifted,
      drifted,
      issues: results.reduce((n, r) => n + r.issues.length, 0),
    },
  };
}
