import "server-only";
import { getAuditDb } from "./audit-db.server";
import { redactPayload } from "./redact.server";

const PAYLOAD_MAX = 8192;
const INSERT =
  `INSERT INTO audit_log (created_at, user, action, target, payload_json, ip)
   VALUES (?, ?, ?, ?, ?, ?)`;

export type AuditInput = {
  action: string;
  target?: string;
  payload?: unknown;
  user: string;
  ip?: string;
};

function encodePayload(payload: unknown): string | null {
  if (payload === undefined || payload === null) return null;
  let json = JSON.stringify(redactPayload(payload));
  if (json.length > PAYLOAD_MAX) {
    json = json.slice(0, PAYLOAD_MAX - 16) + '"…(truncated)"';
  }
  return json;
}

export function logAudit({ action, target, payload, user, ip }: AuditInput): void {
  const db = getAuditDb();
  const stmt = db.prepare(INSERT);
  stmt.run(
    new Date().toISOString(),
    user,
    action,
    target ?? null,
    encodePayload(payload),
    ip ?? null,
  );
}

// emitAudit compat shim removed in Plan 03 — all call-sites migrated to logAudit() in route handlers.
