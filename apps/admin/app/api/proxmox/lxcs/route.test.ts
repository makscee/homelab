import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

// Mock next-auth's auth() via module mock, and mock the pveGet helper.

type AuthFn = () => Promise<{ user?: { login?: string } } | null>;
let authResult: Awaited<ReturnType<AuthFn>> = null;
let pveGetImpl: (path: string) => Promise<unknown> = async () => {
  throw new Error("pveGet not stubbed");
};

mock.module("@/auth", () => ({
  auth: async () => authResult,
}));

mock.module("@/lib/proxmox.server", () => {
  class PveError extends Error {
    constructor(
      public readonly code: string,
      public readonly status: number,
      message: string,
    ) {
      super(message);
      this.name = "PveError";
    }
  }
  return {
    PveError,
    pveGet: (path: string) => pveGetImpl(path),
    parseNet0: () => ({ name: null, bridge: null, hwaddr: null, ip: null, gw: null }),
  };
});

// Import AFTER mocks are registered.
const { GET } = await import("./route");
const { PveError } = await import("@/lib/proxmox.server");

function req(): Request {
  return new Request("https://homelab.makscee.ru/api/proxmox/lxcs");
}

beforeEach(() => {
  authResult = null;
  pveGetImpl = async () => {
    throw new Error("pveGet not stubbed");
  };
});

afterEach(() => {});

describe("GET /api/proxmox/lxcs", () => {
  test("401 when unauthenticated", async () => {
    authResult = null;
    const res = await GET(req() as never);
    expect(res.status).toBe(401);
  });

  test("200 happy path: merges /lxc list with /status/current per vmid", async () => {
    authResult = { user: { login: "alice" } };
    pveGetImpl = async (path: string) => {
      if (path === "/nodes/tower/lxc") {
        return [
          { vmid: "100", name: "docker-tower", status: "running", maxmem: 8e9, maxdisk: 100e9 },
          { vmid: "101", name: "jellyfin", status: "running", maxmem: 4e9, maxdisk: 50e9 },
        ];
      }
      if (path === "/nodes/tower/lxc/100/status/current") {
        return { vmid: 100, cpu: 0.1, mem: 2e9, uptime: 3600, cpus: 4 };
      }
      if (path === "/nodes/tower/lxc/101/status/current") {
        return { vmid: 101, cpu: 0.05, mem: 1e9, uptime: 1800, cpus: 2 };
      }
      throw new Error(`unexpected path ${path}`);
    };
    const res = await GET(req() as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ vmid: string; name: string; cpu?: number; mem?: number; uptime?: number }>;
    };
    expect(body.data.length).toBe(2);
    const first = body.data.find((x) => x.vmid === "100")!;
    expect(first.name).toBe("docker-tower");
    expect(first.cpu).toBe(0.1);
    expect(first.uptime).toBe(3600);
  });

  test("502 PVE_UNREACHABLE when tower is down", async () => {
    authResult = { user: { login: "alice" } };
    pveGetImpl = async () => {
      throw new PveError("PVE_UNREACHABLE", 0, "tower unreachable");
    };
    const res = await GET(req() as never);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("PVE_UNREACHABLE");
  });

  test("502 sanitized on other PveError (PVE_AUTH)", async () => {
    authResult = { user: { login: "alice" } };
    pveGetImpl = async () => {
      throw new PveError("PVE_AUTH", 401, "proxmox auth failed (401)");
    };
    const res = await GET(req() as never);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("PVE_AUTH");
  });
});
