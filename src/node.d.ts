/**
 * Minimal ambient declarations for the handful of Node.js built-ins
 * this project uses. Declaring them in-repo keeps `typescript` the
 * only devDependency (no `@types/node`); the surface below is
 * intentionally restricted to exactly what `src/` calls, so a typo
 * against a real Node API still fails to compile.
 */

declare module "node:fs" {
  export interface Stats {
    isDirectory(): boolean;
  }
  /** Path, or a file descriptor (0 = stdin). */
  export function readFileSync(path: string | number, encoding: "utf8"): string;
  export function writeFileSync(path: string, data: string, encoding: "utf8"): void;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): Stats;
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options: { recursive: true }): void;
}

declare module "node:path" {
  export function join(...parts: string[]): string;
  export function basename(path: string, suffix?: string): string;
}

/** WHATWG URL, a Node.js global; only the surface formats.ts needs. */
declare var URL: new (input: string) => { hostname: string };

interface MinimalWritable {
  write(chunk: string): boolean;
  on(event: "error", listener: (err: { code?: string }) => void): void;
}

declare var process: {
  argv: string[];
  exitCode: number | undefined;
  stdout: MinimalWritable;
  stderr: MinimalWritable;
};
