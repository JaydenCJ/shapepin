/**
 * A tiny, strict flag parser. Unknown flags are hard errors (exit 2)
 * — a CI gate that silently ignores a misspelled `--updaet` would
 * defeat its own purpose. Supports `--flag`, `--flag value`,
 * `--flag=value`, short aliases and repeatable value flags.
 */
import { ShapepinError } from "./types.js";

export class UsageError extends ShapepinError {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export interface FlagSpec {
  /** Long name without dashes, e.g. "dir". */
  name: string;
  /** Does the flag take a value? */
  takesValue: boolean;
  /** May the flag appear more than once? (Value flags only.) */
  repeatable?: boolean;
  /** Optional short alias, e.g. "d". */
  short?: string;
}

export interface ParsedArgs {
  /** Boolean flags present, and single-value flag values. */
  flags: Map<string, string | true>;
  /** Collected values for repeatable flags. */
  lists: Map<string, string[]>;
  positionals: string[];
}

export function parseArgs(argv: string[], specs: FlagSpec[]): ParsedArgs {
  const byToken = new Map<string, FlagSpec>();
  for (const spec of specs) {
    byToken.set("--" + spec.name, spec);
    if (spec.short) byToken.set("-" + spec.short, spec);
  }
  const flags = new Map<string, string | true>();
  const lists = new Map<string, string[]>();
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    // "-" alone means stdin and is a positional, not a flag.
    if (!arg.startsWith("-") || arg === "-") {
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    const token = eq === -1 ? arg : arg.slice(0, eq);
    const spec = byToken.get(token);
    if (!spec) throw new UsageError(`unknown flag ${token} (see --help)`);

    if (!spec.takesValue) {
      if (eq !== -1) throw new UsageError(`flag --${spec.name} takes no value`);
      flags.set(spec.name, true);
      continue;
    }
    let value: string;
    if (eq !== -1) {
      value = arg.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new UsageError(`flag --${spec.name} needs a value`);
      }
      value = next;
      i++;
    }
    if (spec.repeatable) {
      const list = lists.get(spec.name) ?? [];
      list.push(value);
      lists.set(spec.name, list);
    } else {
      if (flags.has(spec.name)) {
        throw new UsageError(`flag --${spec.name} given more than once`);
      }
      flags.set(spec.name, value);
    }
  }
  return { flags, lists, positionals };
}
