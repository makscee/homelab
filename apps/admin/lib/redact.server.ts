import "server-only";

/**
 * Anthropic OAuth token shape. Any substring matching this regex is
 * force-redacted from error messages before they leave a Route Handler.
 *
 * Mirrors the pattern used inside `lib/sops.server.ts::redact` so there is
 * one canonical definition of "what counts as a token" for the entire
 * admin app. Update both sites together if the token prefix ever changes.
 */
export const TOKEN_PATTERN = /sk-ant-oat01-[A-Za-z0-9_-]+/g;

/**
 * Remove every token-shaped substring from an error message, anywhere in
 * the string. Prior implementations used `msg.startsWith("sk-ant-oat01-")`
 * which missed embedded leakage like
 *   "Error while inserting sk-ant-oat01-XYZ: invalid shape"
 * — the upstream sops.server.ts redactor already catches Sops-origin
 * errors, but a non-Sops path (fs error, library wrapper, future code)
 * could still flow a token substring through a Route Handler's catch arm.
 *
 * Defense in depth: every API route calls this before echoing a message
 * to the client.
 */
export function sanitizeErrorMessage(msg: string): string {
  return msg.replace(TOKEN_PATTERN, "[REDACTED]");
}

const DENY_KEYS = new Set([
  "password", "token", "secret", "api_key", "apikey",
  "auth", "authorization", "value", "cookie",
]);

export function redactPayload(input: unknown): unknown {
  if (typeof input === "string") {
    return input.replace(TOKEN_PATTERN, "[REDACTED]");
  }
  if (Array.isArray(input)) return input.map(redactPayload);
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = DENY_KEYS.has(k.toLowerCase()) ? "[REDACTED]" : redactPayload(v);
    }
    return out;
  }
  return input;
}
