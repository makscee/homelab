import "server-only";
import { readFileSync } from "node:fs";
import { Agent, fetch as undiciFetch } from "undici";

// --------------------------------------------------------------------------
// Proxmox read-only API client (server-only).
//
// All traffic goes through a cached undici Agent with the Proxmox CA pinned
// (no TLS-verify bypass anywhere — per D-07 / PROXMOX-06 and ASVS V6).
// The PVEAPIToken header is built from env vars provisioned by
// Plan 19-01 on mcow's /etc/homelab-admin/env.
//
// Env vars consumed:
//   PROXMOX_API_BASE        e.g. https://tower:8006/api2/json
//   PROXMOX_TOKEN_ID        e.g. dashboard-operator@pve!readonly
//   PROXMOX_TOKEN_SECRET    UUID-ish secret — never crosses to the browser
//   PROXMOX_CA_PATH         absolute path to the tower CA PEM
//   PROXMOX_TLS_SERVERNAME  (optional) SNI override; default derived from URL
// --------------------------------------------------------------------------

export class PveError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PveError";
  }
}

// Lazy singleton — the CA is read from disk the first time pveGet is called
// (so missing env / missing file surfaces a clear error at call time, not at
// module import time where it would crash the whole Next server).
let _agent: Agent | null = null;
let _agentSignature = ""; // invalidate cache if CA path changes across tests

function loadAgent(): Agent {
  const caPath = process.env.PROXMOX_CA_PATH;
  if (!caPath) {
    throw new Error(
      "PROXMOX_CA_PATH is not set; cannot establish CA-pinned TLS to Proxmox.",
    );
  }
  const sigBase = `${caPath}::${process.env.PROXMOX_TLS_SERVERNAME ?? ""}`;
  if (_agent && _agentSignature === sigBase) return _agent;

  let ca: Buffer;
  try {
    ca = readFileSync(caPath);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new Error(
      `failed to read PROXMOX_CA_PATH (${caPath}): ${reason}`,
    );
  }

  const connect: Record<string, unknown> = { ca };
  // Default: undici derives SNI from the URL hostname (e.g. "tower"), which
  // matches the cert SAN verified during Plan 19-01. Operators can override
  // via PROXMOX_TLS_SERVERNAME if a SAN mismatch is ever introduced.
  const sni = process.env.PROXMOX_TLS_SERVERNAME;
  if (sni && sni.length > 0) connect.servername = sni;

  _agent = new Agent({ connect });
  _agentSignature = sigBase;
  return _agent;
}

function buildAuthHeader(): string {
  const id = process.env.PROXMOX_TOKEN_ID;
  const secret = process.env.PROXMOX_TOKEN_SECRET;
  if (!id || !secret) {
    throw new Error(
      "PROXMOX_TOKEN_ID / PROXMOX_TOKEN_SECRET not set; cannot authenticate to Proxmox.",
    );
  }
  // Literal `=` between tokenId and secret — per PVE API docs.
  return `PVEAPIToken=${id}=${secret}`;
}

function joinUrl(base: string, path: string): string {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

type PveEnvelope<T> = { data: T };

/**
 * GET a path on the Proxmox API (relative to PROXMOX_API_BASE).
 * Returns the unwrapped `data` field from the PVE response envelope.
 *
 * Throws PveError with:
 *   code="PVE_AUTH"        on 401/403
 *   code="PVE_HTTP"        on other non-2xx
 *   code="PVE_UNREACHABLE" on ECONNREFUSED / ETIMEDOUT / ENOTFOUND / EAI_AGAIN
 */
export async function pveGet<T>(path: string): Promise<T> {
  const base = process.env.PROXMOX_API_BASE;
  if (!base) {
    throw new Error("PROXMOX_API_BASE is not set.");
  }
  const url = joinUrl(base, path);
  const agent = loadAgent();
  const authHeader = buildAuthHeader();

  let resp: Awaited<ReturnType<typeof undiciFetch>>;
  try {
    // Use undici.fetch directly (not Node's global fetch) so the userland
    // Agent dispatcher interface matches. Passing a userland undici Agent
    // to Node's bundled fetch triggers "invalid onRequestStart method"
    // when Node's and userland undici versions diverge.
    resp = await undiciFetch(url, {
      method: "GET",
      headers: {
        authorization: authHeader,
        accept: "application/json",
      },
      dispatcher: agent,
    });
  } catch (e) {
    const code = (e as { code?: string } | null)?.code ?? "";
    const causeCode =
      (e as { cause?: { code?: string } } | null)?.cause?.code ?? "";
    const c = code || causeCode;
    if (
      c === "ECONNREFUSED" ||
      c === "ETIMEDOUT" ||
      c === "ENOTFOUND" ||
      c === "EAI_AGAIN" ||
      c === "UND_ERR_SOCKET" ||
      c === "UND_ERR_CONNECT_TIMEOUT"
    ) {
      throw new PveError("PVE_UNREACHABLE", 0, "tower unreachable");
    }
    // Unknown network failure — still treat as unreachable rather than
    // echoing the underlying message (which may include hostnames/paths).
    throw new PveError("PVE_UNREACHABLE", 0, "tower unreachable");
  }

  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) {
      throw new PveError("PVE_AUTH", resp.status, `proxmox auth failed (${resp.status})`);
    }
    throw new PveError("PVE_HTTP", resp.status, `proxmox HTTP ${resp.status}`);
  }

  let body: PveEnvelope<T>;
  try {
    body = (await resp.json()) as PveEnvelope<T>;
  } catch {
    throw new PveError("PVE_HTTP", resp.status, "proxmox returned non-JSON body");
  }
  return body.data;
}

/**
 * Test-only hook: reset the cached Agent. Not exported through the package
 * entry point. Used by proxmox.server.test.ts to avoid cross-test leakage.
 */
export function _resetForTests(): void {
  _agent = null;
  _agentSignature = "";
}

/**
 * Parse PVE's CSV-style net0 string into a typed object.
 *
 * Example input:
 *   "name=eth0,bridge=vmbr0,hwaddr=BC:24:11:00:00:00,ip=10.10.20.100/24,gw=10.10.20.1"
 *
 * Defensive: if PVE 8.x changes the format, missing fields fall back to
 * null rather than throwing.
 */
export function parseNet0(raw: string | undefined): {
  name: string | null;
  bridge: string | null;
  hwaddr: string | null;
  ip: string | null;
  gw: string | null;
} {
  const out = { name: null, bridge: null, hwaddr: null, ip: null, gw: null } as {
    name: string | null;
    bridge: string | null;
    hwaddr: string | null;
    ip: string | null;
    gw: string | null;
  };
  if (!raw) return out;
  for (const part of raw.split(",")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k in out) (out as Record<string, string | null>)[k] = v;
  }
  return out;
}
