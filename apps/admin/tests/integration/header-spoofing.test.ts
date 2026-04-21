/**
 * SEC-08 D-22-11 — Header-spoofing resistance integration test.
 *
 * Contract: a request with forged X-Tailscale-User / X-Forwarded-User headers
 * and NO valid next-auth session cookie MUST return 401/302/403 on every
 * protected route. Any 200 is a HARD FAIL — auth bypass blocks launch.
 *
 * Runs against a live deploy (default: https://homelab.makscee.ru) — the admin
 * panel is Tailnet-only, so this suite must be executed from a Tailnet vantage
 * (cc-worker, operator laptop, etc.). See scripts/security/verify-tailnet-only-ingress.sh
 * for the complementary WAN-side check.
 *
 * Runner: `bun test` (apps/admin already uses bun as test runner per package.json).
 */
import { describe, it, expect } from "bun:test";

const BASE = process.env.ADMIN_BASE_URL ?? "https://homelab.makscee.ru";

const PROTECTED_ROUTES: readonly string[] = [
  "/",
  "/audit",
  "/alerts",
  "/api/hosts",
  "/api/audit",
];

const FORGED_HEADERS: ReadonlyArray<Record<string, string>> = [
  { "X-Tailscale-User": "makscee@tailnet.ts.net" },
  { "X-Forwarded-User": "makscee" },
  { "X-Tailscale-User": "attacker@evil.com", "X-Forwarded-User": "attacker" },
  { "X-Forwarded-For": "127.0.0.1", "X-Tailscale-User": "makscee" },
];

describe("SEC-08 D-22-11: header-spoofing resistance", () => {
  for (const route of PROTECTED_ROUTES) {
    for (const headers of FORGED_HEADERS) {
      it(`rejects ${JSON.stringify(headers)} at ${route}`, async () => {
        const res = await fetch(`${BASE}${route}`, {
          redirect: "manual",
          headers: { ...headers },
        });

        // Contract: MUST NOT return 200 with forged headers + no session cookie.
        // Accept 401 (API routes), 302/307 (HTML → /login redirect), 403 (allowlist).
        expect([401, 302, 307, 403]).toContain(res.status);

        if (res.status === 302 || res.status === 307) {
          const loc = res.headers.get("location") ?? "";
          expect(loc).toMatch(/\/login|\/api\/auth\/signin|\/403/);
        }

        // Sanity: response body must not contain user-specific/PII markers.
        const body = await res.text();
        expect(body).not.toContain("makscee@");
      });
    }
  }
});
