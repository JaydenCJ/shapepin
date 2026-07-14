// Shared test helpers: a temp-workspace factory for CLI-facing tests
// and a synchronous runner for the built CLI. Every workspace lives
// under a mkdtemp directory and is removed when the process exits, so
// tests are deterministic and leave no state behind.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "dist", "cli.js");

const created = [];
process.on("exit", () => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

/**
 * Create a throwaway workspace populated with the given files
 * (relative path -> content; objects are written as JSON).
 * Returns its absolute path.
 */
export function workspace(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "shapepin-test-"));
  created.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    const text =
      typeof content === "string" ? content : JSON.stringify(content, null, 2);
    writeFileSync(abs, text, "utf8");
  }
  return dir;
}

/**
 * Run the built CLI in `cwd`. Returns { code, stdout, stderr } with
 * output trimmed of the trailing newline for easy assertions.
 */
export function runCli(args, { cwd, input } = {}) {
  const result = spawnSync("node", [CLI, ...args], {
    cwd,
    input,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return {
    code: result.status,
    stdout: result.stdout.replace(/\n$/, ""),
    stderr: result.stderr.replace(/\n$/, ""),
  };
}
