import "server-only";

// --------------------------------------------------------------------------
// Phase 14 contract — DO NOT change field names or add new ones without a
// matching migration. The sink today is stdout (captured by journald);
// Phase 14 will tee this into a sqlite insert without changing the record
// shape. The emitter MUST remain synchronous so callers can be confident the
// event is visible to the kernel's journal buffer before a subsequent
// mutation completes.
// --------------------------------------------------------------------------

export type AuditAction =
  | "token.add"
  | "token.rotate"
  | "token.toggle"
  | "token.rename"
  | "token.delete";

export type AuditDiff = Record<string, { before?: unknown; after?: unknown }>;

export type AuditEvent = {
  ts: string;
  actor: string;
  action: AuditAction;
  token_id: string;
  diff: AuditDiff;
};

// Field names whose before/after values are ALWAYS redacted, regardless of
// what the caller passed in. The registry schema only has one secret-bearing
// field today (`value`), but this set is the single point to extend if more
// secret-bearing fields are introduced.
const VALUE_FIELDS = new Set(["value"]);

function redactDiff(diff: AuditDiff): AuditDiff {
  const out: AuditDiff = {};
  for (const [k, v] of Object.entries(diff)) {
    if (VALUE_FIELDS.has(k)) {
      out[k] = { before: "[REDACTED]", after: "[REDACTED]" };
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Write a single-line JSON audit event to stdout. Synchronous by contract —
 * journald and the event loop both rely on write ordering here. Callers must
 * invoke this exactly once per successful mutation.
 *
 * `ts` is optional; if omitted the emitter stamps ISO 8601 wall-clock time.
 */
export function emitAudit(
  event: Omit<AuditEvent, "ts"> & { ts?: string },
): void {
  const payload: AuditEvent = {
    ts: event.ts ?? new Date().toISOString(),
    actor: event.actor,
    action: event.action,
    token_id: event.token_id,
    diff: redactDiff(event.diff),
  };
  process.stdout.write(JSON.stringify(payload) + "\n");
}
