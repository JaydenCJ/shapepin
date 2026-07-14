// CLI integration tests: the built dist/cli.js run against throwaway
// workspaces. These pin the exit-code contract (0 clean, 1 drift,
// 2 usage/input error) that CI gating depends on.
import { deepStrictEqual, match, strictEqual } from "node:assert";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { runCli, workspace } from "./helpers.mjs";

const CAPTURE_A = {
  items: [{ sku: "KB-750", qty: 1, price: 49.99 }],
  status: "open",
};
const CAPTURE_B = {
  items: [{ sku: "MUG-500", qty: 2, price: 9.75 }],
  status: "open",
};

function pinnedWorkspace() {
  const dir = workspace({ "a.json": CAPTURE_A, "b.json": CAPTURE_B });
  const result = runCli(["pin", "cart", "a.json", "b.json"], { cwd: dir });
  strictEqual(result.code, 0, result.stderr);
  return dir;
}

test("--version prints the manifest version", () => {
  const { code, stdout } = runCli(["--version"]);
  strictEqual(code, 0);
  strictEqual(stdout, "0.1.0");
});

test("--help documents every command and exits 0", () => {
  const { code, stdout } = runCli(["--help"]);
  strictEqual(code, 0);
  for (const word of ["pin", "check", "show", "ls", "tolerate", "--update", "Exit codes"]) {
    strictEqual(stdout.includes(word), true, `help missing ${word}`);
  }
});

test("pin writes a deterministic pin file into __shapepins__", () => {
  const dir = pinnedWorkspace();
  const file = join(dir, "__shapepins__", "cart.pin.json");
  strictEqual(existsSync(file), true);
  const doc = JSON.parse(readFileSync(file, "utf8"));
  strictEqual(doc.shapepin, 1);
  strictEqual(doc.examples, 2);
  // Same captures, other order → byte-identical pin.
  runCli(["pin", "cart2", "b.json", "a.json"], { cwd: dir });
  const other = readFileSync(join(dir, "__shapepins__", "cart2.pin.json"), "utf8")
    .replace('"name": "cart2"', '"name": "cart"');
  strictEqual(other, readFileSync(file, "utf8"));
});

test("pin refuses to clobber an existing pin without --merge or --force", () => {
  const dir = pinnedWorkspace();
  const { code, stderr } = runCli(["pin", "cart", "a.json"], { cwd: dir });
  strictEqual(code, 2);
  match(stderr, /already exists/);
});

test("pin --merge extends the pin and bumps the example count", () => {
  const dir = pinnedWorkspace();
  const extra = { items: [], status: "closed", coupon: "SAVE10" };
  const { code, stdout } = runCli(["pin", "cart", "--merge", "-"], {
    cwd: dir,
    input: JSON.stringify(extra),
  });
  strictEqual(code, 0);
  match(stdout, /now 3/);
  const doc = JSON.parse(
    readFileSync(join(dir, "__shapepins__", "cart.pin.json"), "utf8"),
  );
  strictEqual(doc.shape.fields.coupon.optional, true);
});

test("pin --split treats a top-level array as one example per element", () => {
  const dir = workspace({ "batch.json": [CAPTURE_A, CAPTURE_B, CAPTURE_A] });
  const { code, stdout } = runCli(["pin", "cart", "--split", "batch.json"], {
    cwd: dir,
  });
  strictEqual(code, 0);
  match(stdout, /from 3 examples/);
});

test("check exits 0 on clean payloads and prints per-file ticks", () => {
  const dir = pinnedWorkspace();
  const { code, stdout } = runCli(["check", "cart", "a.json", "b.json"], {
    cwd: dir,
  });
  strictEqual(code, 0);
  match(stdout, /✓ a\.json/);
  match(stdout, /2 clean, 0 drifted/);
});

test("check exits 1 on drift and names path, kind and detail", () => {
  const dir = pinnedWorkspace();
  const drifted = {
    items: [{ sku: "KB-750", qty: 1, price: "49.99" }],
    status: "open",
  };
  const { code, stdout } = runCli(["check", "cart", "-"], {
    cwd: dir,
    input: JSON.stringify(drifted),
  });
  strictEqual(code, 1);
  match(stdout, /✗ stdin — 1 drift issue/);
  match(stdout, /\/items\/0\/price\s+type-changed\s+pinned number, got string/);
});

test("check --json emits a stable machine document", () => {
  const dir = pinnedWorkspace();
  const drifted = { items: [], status: null };
  const args = ["check", "cart", "--json", "-"];
  const first = runCli(args, { cwd: dir, input: JSON.stringify(drifted) });
  const second = runCli(args, { cwd: dir, input: JSON.stringify(drifted) });
  strictEqual(first.code, 1);
  strictEqual(first.stdout, second.stdout);
  const doc = JSON.parse(first.stdout);
  strictEqual(doc.tool, "shapepin");
  strictEqual(doc.ok, false);
  strictEqual(doc.summary.drifted, 1);
  deepStrictEqual(doc.payloads[0].issues[0], {
    path: "/status",
    kind: "null-value",
    message: 'pinned "open", got null',
  });
});

test("check --update accepts the drift and the next check is green", () => {
  const dir = pinnedWorkspace();
  const drifted = {
    items: [{ sku: "X", qty: 1.5, price: 1 }],
    status: "reopened",
  };
  const update = runCli(["check", "cart", "--update", "-"], {
    cwd: dir,
    input: JSON.stringify(drifted),
  });
  strictEqual(update.code, 0);
  match(update.stdout, /now 3 examples/);
  const dfile = workspace({ "d.json": drifted });
  const recheck = runCli(["check", "cart", "--dir", join(dir, "__shapepins__"), join(dfile, "d.json")]);
  strictEqual(recheck.code, 0, recheck.stdout + recheck.stderr);
});

test("show renders the signature; show --json prints the pin verbatim", () => {
  const dir = pinnedWorkspace();
  const { code, stdout } = runCli(["show", "cart"], { cwd: dir });
  strictEqual(code, 0);
  match(stdout, /pin "cart" — 2 examples, 0 tolerances/);
  match(stdout, /qty: number \(integer\)/);
  const json = runCli(["show", "cart", "--json"], { cwd: dir });
  strictEqual(
    json.stdout + "\n",
    readFileSync(join(dir, "__shapepins__", "cart.pin.json"), "utf8"),
  );
});

test("ls lists pins sorted with counts; empty dirs say so", () => {
  const dir = pinnedWorkspace();
  runCli(["pin", "alpha", "a.json"], { cwd: dir });
  const { stdout } = runCli(["ls"], { cwd: dir });
  match(stdout, /alpha\s+1 example\s+0 tolerances/);
  match(stdout, /cart\s+2 examples\s+0 tolerances/);
  match(stdout, /2 pins in __shapepins__/);
  const empty = workspace();
  strictEqual(runCli(["ls"], { cwd: empty }).stdout, "no pins in __shapepins__");
});

test("tolerate adds a rule that check then honors; --rm removes it", () => {
  const dir = pinnedWorkspace();
  const drifted = { items: [], status: "closed" };
  // "closed" vs pinned "open": with only one distinct value the enum
  // is locked (2 hits, 1 value), so this drifts…
  strictEqual(
    runCli(["check", "cart", "-"], { cwd: dir, input: JSON.stringify(drifted) }).code,
    1,
  );
  runCli(["tolerate", "cart", "/status=open-enum"], { cwd: dir });
  strictEqual(
    runCli(["check", "cart", "-"], { cwd: dir, input: JSON.stringify(drifted) }).code,
    0,
  );
  // Adding the same rule twice is a friendly no-op.
  const again = runCli(["tolerate", "cart", "/status=open-enum"], { cwd: dir });
  strictEqual(again.code, 0);
  match(again.stdout, /already on/);
  const rm = runCli(["tolerate", "cart", "/status=open-enum", "--rm"], { cwd: dir });
  strictEqual(rm.code, 0);
  // Removing a rule that is not there is an error, not a silent pass.
  strictEqual(
    runCli(["tolerate", "cart", "/nope=optional", "--rm"], { cwd: dir }).code,
    2,
  );
  strictEqual(
    runCli(["check", "cart", "-"], { cwd: dir, input: JSON.stringify(drifted) }).code,
    1,
  );
});

test("usage and input errors exit 2 with a shapepin: error: prefix", () => {
  const dir = pinnedWorkspace();
  const cases = [
    ["frobnicate"],
    ["check", "cart", "--updaet", "a.json"],
    ["check", "missing-pin", "a.json"],
    ["check", "cart", "no-such-file.json"],
    ["pin", "bad/name", "a.json"],
    ["tolerate", "cart", "/status=frobnicate"],
  ];
  for (const args of cases) {
    const { code, stderr } = runCli(args, { cwd: dir });
    strictEqual(code, 2, `expected exit 2 for: ${args.join(" ")}`);
    match(stderr, /^shapepin: error: /);
  }
});

test("invalid JSON payloads name the file, not just the parser", () => {
  const dir = pinnedWorkspace();
  const bad = workspace({ "bad.json": "{ nope" });
  const { code, stderr } = runCli(
    ["check", "cart", "--dir", join(dir, "__shapepins__"), join(bad, "bad.json")],
  );
  strictEqual(code, 2);
  match(stderr, /bad\.json: not valid JSON/);
});

test("a corrupted pin file fails loudly with its path", () => {
  const dir = pinnedWorkspace();
  const file = join(dir, "__shapepins__", "cart.pin.json");
  const doc = JSON.parse(readFileSync(file, "utf8"));
  doc.shapepin = 99;
  writeFileSync(file, JSON.stringify(doc), "utf8");
  const { code, stderr } = runCli(["check", "cart", "a.json"], { cwd: dir });
  strictEqual(code, 2);
  match(stderr, /unsupported pin format version/);
  match(stderr, /cart\.pin\.json/);
});
