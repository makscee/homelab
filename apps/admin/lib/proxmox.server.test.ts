import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type UndiciFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
let undiciFetchImpl: UndiciFetch = async () => new Response("{}", { status: 200 });
class StubAgent {
  constructor(_opts: unknown) {}
}
mock.module("undici", () => ({
  Agent: StubAgent,
  fetch: (input: string | URL | Request, init?: RequestInit) =>
    undiciFetchImpl(input, init),
}));

// NOTE: we re-require the module in beforeEach so env changes + singleton
// reset take effect per test. Bun's module cache is cleared via delete require.cache.

type PveMod = typeof import("./proxmox.server");

// Minimal shape of what pveGet/PveError export
let mod: PveMod;

const originalEnv = { ...process.env };
let tmpCaPath: string;
let lastCall: { url: string; init: RequestInit | undefined } = {
  url: "",
  init: undefined,
};

type FetchLike = UndiciFetch;

function installFetch(impl: FetchLike): void {
  undiciFetchImpl = impl;
}

function resetMod(): void {
  // Bun supports require.cache semantics for module reset.
  const modPath = require.resolve("./proxmox.server");
  delete require.cache[modPath];
  mod = require("./proxmox.server") as PveMod;
}

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "pve-ca-"));
  tmpCaPath = join(dir, "ca.pem");
  writeFileSync(
    tmpCaPath,
    "-----BEGIN CERTIFICATE-----\nMIIBFAKE\n-----END CERTIFICATE-----\n",
  );
  process.env.PROXMOX_API_BASE = "https://tower:8006/api2/json";
  process.env.PROXMOX_TOKEN_ID = "dashboard-operator@pve!readonly";
  process.env.PROXMOX_TOKEN_SECRET = "deadbeef-1234-5678";
  process.env.PROXMOX_CA_PATH = tmpCaPath;
  delete process.env.PROXMOX_TLS_SERVERNAME;
  lastCall = { url: "", init: undefined };
  resetMod();
});

afterEach(() => {
  undiciFetchImpl = async () => new Response("{}", { status: 200 });
  try {
    unlinkSync(tmpCaPath);
  } catch {}
  process.env = { ...originalEnv };
});

describe("pveGet — authorization header", () => {
  test("sends PVEAPIToken header with literal `=` between tokenId and secret", async () => {
    installFetch(async (input, init) => {
      lastCall = {
        url: typeof input === "string" ? input : (input as Request).url,
        init,
      };
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const out = await mod.pveGet<{ ok: boolean }>("/nodes/tower/lxc");
    expect(out).toEqual({ ok: true });
    const headers = new Headers(
      (lastCall.init?.headers as HeadersInit | undefined) ?? {},
    );
    const auth = headers.get("authorization");
    expect(auth).toBe(
      "PVEAPIToken=dashboard-operator@pve!readonly=deadbeef-1234-5678",
    );
    // Path appended to base.
    expect(lastCall.url).toBe("https://tower:8006/api2/json/nodes/tower/lxc");
  });
});

describe("pveGet — CA path handling", () => {
  test("throws an explicit error mentioning PROXMOX_CA_PATH when file missing", async () => {
    process.env.PROXMOX_CA_PATH = "/nonexistent/ca-path-xyz.pem";
    resetMod();
    installFetch(async () => new Response("{}", { status: 200 }));
    let caught: unknown;
    try {
      await mod.pveGet("/x");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    const err = caught as Error;
    expect(err.message).toContain("/nonexistent/ca-path-xyz.pem");
  });
});

describe("pveGet — error mapping", () => {
  test("401 response throws PveError with status=401, code=PVE_AUTH", async () => {
    installFetch(async () =>
      new Response(JSON.stringify({ data: null }), { status: 401 }),
    );
    let caught: unknown;
    try {
      await mod.pveGet("/x");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(mod.PveError);
    const err = caught as InstanceType<typeof mod.PveError>;
    expect(err.status).toBe(401);
    expect(err.code).toBe("PVE_AUTH");
  });

  test("ECONNREFUSED throws PveError with code=PVE_UNREACHABLE", async () => {
    installFetch(async () => {
      const e = new Error("connect ECONNREFUSED 192.0.2.1:8006") as Error & {
        code?: string;
      };
      e.code = "ECONNREFUSED";
      throw e;
    });
    let caught: unknown;
    try {
      await mod.pveGet("/x");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(mod.PveError);
    const err = caught as InstanceType<typeof mod.PveError>;
    expect(err.code).toBe("PVE_UNREACHABLE");
    expect(err.status).toBe(0);
  });

  test("500 response throws PveError with code=PVE_HTTP and status=500", async () => {
    installFetch(async () =>
      new Response("internal", { status: 500 }),
    );
    let caught: unknown;
    try {
      await mod.pveGet("/x");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(mod.PveError);
    const err = caught as InstanceType<typeof mod.PveError>;
    expect(err.code).toBe("PVE_HTTP");
    expect(err.status).toBe(500);
  });
});
