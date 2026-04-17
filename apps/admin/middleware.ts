import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = new Set<string>(["/login", "/403", "/api/health"]);
const isApiAuthPath = (p: string) => p.startsWith("/api/auth/");
const isStaticAsset = (p: string) =>
  p.startsWith("/_next/") || p === "/favicon.ico";

/**
 * Edge-safe allowlist check — reads the same env var as lib/auth-allowlist.ts
 * but inlined here to avoid importing 'server-only' into the Edge runtime.
 */
function isLoginAllowedEdge(login: string | null | undefined): boolean {
  if (!login) return false;
  const raw = process.env.HOMELAB_ADMIN_ALLOWED_GITHUB_LOGINS ?? "";
  const allowed = new Set(
    raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
  return allowed.has(login.toLowerCase());
}

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://avatars.githubusercontent.com",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

function applySecurityHeaders(res: NextResponse, nonce: string): NextResponse {
  res.headers.set("Content-Security-Policy", buildCsp(nonce));
  res.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  return res;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString(
    "base64",
  );

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);

  // Public paths + OAuth callback → always pass through, but still apply headers.
  if (
    PUBLIC_PATHS.has(pathname) ||
    isApiAuthPath(pathname) ||
    isStaticAsset(pathname)
  ) {
    const passRes = NextResponse.next({ request: { headers: requestHeaders } });
    return applySecurityHeaders(passRes, nonce);
  }

  const session = req.auth;
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return applySecurityHeaders(NextResponse.redirect(url), nonce);
  }

  const login = (session.user as { login?: string } | undefined)?.login;
  if (!isLoginAllowedEdge(login)) {
    const url = req.nextUrl.clone();
    url.pathname = "/403";
    return applySecurityHeaders(NextResponse.redirect(url), nonce);
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  return applySecurityHeaders(res, nonce);
});

export const config = {
  // Match everything except Next.js internals and static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
