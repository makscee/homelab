/**
 * Build-time shim for bun:sqlite.
 *
 * Next.js builds routes in a Node.js worker process where `bun:sqlite` is
 * not available. This shim satisfies the import during webpack bundling so
 * the build completes. At runtime the app runs under Bun which resolves
 * `bun:sqlite` natively — this shim is never executed in production.
 *
 * Wired via `next.config.mjs` webpack alias (server-only).
 */
export class Database {
  constructor(_path: string, _opts?: unknown) {
    throw new Error("bun:sqlite shim: should not be called at build time");
  }
  run(_sql: string, ..._params: unknown[]): unknown { return null; }
  prepare(_sql: string): unknown { return null; }
  query(_sql: string): unknown { return null; }
  close(): void {}
}
