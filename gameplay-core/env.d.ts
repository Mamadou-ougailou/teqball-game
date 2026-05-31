/**
 * Minimal ambient declarations so the core type-checks with `"types": []` and
 * without the DOM lib — while still depending on NOTHING at runtime.
 *
 * `console` is available in every JS runtime (browser, Node, Deno, workers); we
 * only need to tell the standalone type-checker it exists. This keeps the
 * "zero external dependencies" guarantee intact (no @types/node, no DOM lib).
 */
declare const console: {
  log(...data: unknown[]): void;
  warn(...data: unknown[]): void;
  error(...data: unknown[]): void;
};
