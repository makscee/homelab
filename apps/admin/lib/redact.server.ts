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
