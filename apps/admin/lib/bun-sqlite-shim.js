/**
 * Build-time shim for bun:sqlite (CommonJS, Node.js-loadable).
 *
 * Next.js builds route files in a Node.js worker process where bun:sqlite
 * is not available. This shim satisfies the require() call during the
 * "collecting page data" step. At runtime the app runs under Bun which
 * resolves bun:sqlite natively — this shim is never executed in production.
 *
 * Wired via next.config.mjs webpack externals interceptor (server-only).
 */
class Database {
  constructor(_path, _opts) {
    throw new Error("bun:sqlite shim: should not be called at build time");
  }
}

module.exports = { Database };
