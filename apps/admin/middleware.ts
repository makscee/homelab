import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

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
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://avatars.githubusercontent.com",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://github.com",
  ].join("; ");
}

function buildRedirectUrl(req: NextRequest, pathname: string): URL {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const fwdHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const fwdProto = req.headers.get("x-forwarded-proto");
  if (fwdHost) url.host = fwdHost;
  if (fwdProto) url.protocol = `${fwdProto}:`;
  return url;
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

export default async function middleware(req: NextRequest) {
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

  // Decode raw JWT to read `login` directly — bypasses needing a session()
  // callback in middleware (Auth.js v5 would otherwise not expose custom
  // token fields through `req.auth.user`).
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie: true,
    cookieName: "__Secure-authjs.session-token",
  });
  if (!token) {
    return applySecurityHeaders(
      NextResponse.redirect(buildRedirectUrl(req, "/login")),
      nonce,
    );
  }

  const login = typeof (token as { login?: unknown }).login === "string"
    ? (token as { login: string }).login
    : undefined;
  if (!isLoginAllowedEdge(login)) {
    return applySecurityHeaders(
      NextResponse.redirect(buildRedirectUrl(req, "/403")),
      nonce,
    );
  }

  if (login) requestHeaders.set("x-user-login", login);
  const picture = typeof (token as { picture?: unknown }).picture === "string"
    ? (token as { picture: string }).picture
    : undefined;
  if (picture) requestHeaders.set("x-user-picture", picture);

  const res = NextResponse.next({ request: { headers: requestHeaders } });

  if (!req.cookies.get("hla-csrf")) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    res.cookies.set({
      name: "hla-csrf",
      value: token,
      path: "/",
      sameSite: "strict",
      secure: true,
      httpOnly: false,
      maxAge: 28800,
    });
  }

  return applySecurityHeaders(res, nonce);
}

export const config = {
  // Match everything except Next.js internals and static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
