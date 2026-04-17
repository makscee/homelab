/**
 * bun:sqlite TS type surface. Runtime behavior lives in bun-sqlite-shim.js
 * (webpack externals routes the actual require() to the .js module).
 * This file exists for tsserver and direct-import test scenarios.
 */
export class Database {
  constructor(_path: string, _opts?: unknown) {
    if (typeof (globalThis as any).Bun !== "undefined") {
      // If someone imports the .ts at runtime under Bun, defer to native.
      const native = require("bun:sqlite") as { Database: new (p: string, o?: unknown) => unknown };
      return new native.Database(_path, _opts) as unknown as Database;
    }
    throw new Error("bun:sqlite shim: should not be called at build time");
  }
  run(_sql: string, ..._params: unknown[]): unknown { return null; }
  prepare(_sql: string): unknown { return null; }
  query(_sql: string): unknown { return null; }
  close(): void {}
}
