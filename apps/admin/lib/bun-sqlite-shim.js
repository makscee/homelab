/**
 * bun:sqlite shim — dual-mode.
 *
 * 1. Runtime (Bun): proxies native `bun:sqlite` by re-exporting its module.
 *    The webpack externals interceptor in next.config.mjs rewrites
 *    `import { Database } from 'bun:sqlite'` to `require('/abs/.../bun-sqlite-shim.js')`;
 *    under Bun, this file in turn `require('bun:sqlite')` which resolves natively.
 *
 * 2. Build (Node.js — Next.js worker): `Bun` global is absent; we export a
 *    throw-on-construct stub so `next build` can resolve the module without
 *    actually executing any SQLite code.
 *
 * Do NOT move the `typeof Bun` check below the native require — it must gate it.
 */
if (typeof Bun !== "undefined") {
  // Under Bun: delegate every export to the real native module.
  module.exports = require("bun:sqlite");
} else {
  // Under Node.js build worker: construction throws; bare require() does not.
  class Database {
    constructor(_path, _opts) {
      throw new Error("bun:sqlite shim: should not be called at build time");
    }
  }
  module.exports = { Database };
}
