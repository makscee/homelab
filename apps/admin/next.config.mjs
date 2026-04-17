import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// bun:sqlite shim — resolved synchronously at config-load time.
const bunSqliteShim = path.resolve(__dirname, 'lib/bun-sqlite-shim.js');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Nonce-based CSP via middleware (Plan 04). No runtime config here.
  },
  webpack(config, { isServer }) {
    if (isServer) {
      // bun:sqlite is a Bun-native virtual module unavailable in Node.js.
      // Next.js's default server-externals logic marks it as a bare external
      // before webpack alias resolution can fire. Override the externals array
      // to intercept bun:sqlite first and substitute the build-time shim.
      // At Bun runtime the real bun:sqlite is resolved natively; the shim is
      // never executed in production.
      const prevExternals = Array.isArray(config.externals)
        ? config.externals
        : config.externals
        ? [config.externals]
        : [];

      config.externals = [
        // Intercept bun:sqlite before any other external handler fires.
        (ctx, callback) => {
          if (ctx.request === 'bun:sqlite') {
            // Return the shim as a CommonJS module path (prefixed with 'commonjs ')
            // so webpack emits: module.exports = require('/abs/path/to/shim')
            return callback(null, `commonjs ${bunSqliteShim}`);
          }
          callback();
        },
        ...prevExternals,
      ];
    }
    return config;
  },
};
export default nextConfig;
