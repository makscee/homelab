// Client-only. DO NOT import in any `*.server.ts` file.
//
// Imports the CSRF constants from `csrf.shared` (the neutral isomorphic
// module) — NOT from `csrf.server`, which carries `import "server-only"` and
// would poison the client bundle.
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/csrf.shared";

function getCsrf(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`));
  return match ? match.slice(CSRF_COOKIE_NAME.length + 1) : "";
}

type ApiError = Error & { status?: number; issues?: unknown };

async function send(input: RequestInfo, init: RequestInit): Promise<any> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  headers.set(CSRF_HEADER_NAME, getCsrf());
  const resp = await fetch(input, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = (body && (body.error as string)) ?? `HTTP ${resp.status}`;
    const err = new Error(msg) as ApiError;
    err.status = resp.status;
    if (body && body.issues) err.issues = body.issues;
    throw err;
  }
  return body;
}

export async function apiAddToken(input: {
  label: string;
  value: string;
  tier: string;
  owner_host: string;
  notes?: string;
}) {
  return send("/api/tokens", { method: "POST", body: JSON.stringify(input) });
}

export async function apiRotateToken(id: string, value: string) {
  return send(`/api/tokens/${id}/rotate`, {
    method: "POST",
    body: JSON.stringify({ value }),
  });
}

export async function apiToggleEnabled(id: string, enabled: boolean) {
  return send(`/api/tokens/${id}/toggle`, {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

export async function apiRenameToken(id: string, label: string) {
  return send(`/api/tokens/${id}/rename`, {
    method: "POST",
    body: JSON.stringify({ label }),
  });
}

export async function apiDeleteToken(id: string) {
  return send(`/api/tokens/${id}`, { method: "DELETE" });
}
