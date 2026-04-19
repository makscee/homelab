import { describe, test, expect, beforeEach, mock } from "bun:test";

let authResult: { user?: { login?: string } } | null = null;
let pveGetImpl: (path: string) => Promise<unknown> = async () => {
  throw new Error("not stubbed");
};
const seenPaths: string[] = [];

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
    pveGet: (path: string) => {
      seenPaths.push(path);
      return pveGetImpl(path);
    },
  };
});

const { GET, parseNet0 } = await import("./route");
const { PveError } = await import("@/lib/proxmox.server");

function req(): Request {
  return new Request("https://homelab.makscee.ru/x");
}

beforeEach(() => {
  authResult = null;
  seenPaths.length = 0;
  pveGetImpl = async () => {
    throw new Error("not stubbed");
  };
});

describe("parseNet0", () => {
  test("parses full net0 string", () => {
    const out = parseNet0(
      "name=eth0,bridge=vmbr0,hwaddr=BC:24:11:00:00:00,ip=10.10.20.100/24,gw=10.10.20.1",
    );
    expect(out).toEqual({
      name: "eth0",
      bridge: "vmbr0",
      hwaddr: "BC:24:11:00:00:00",
      ip: "10.10.20.100/24",
      gw: "10.10.20.1",
    });
  });

  test("missing fields → null (defensive)", () => {
    const out = parseNet0("name=eth0,bridge=vmbr0");
    expect(out.ip).toBeNull();
    expect(out.gw).toBeNull();
    expect(out.hwaddr).toBeNull();
  });

  test("undefined → all nulls", () => {
    const out = parseNet0(undefined);
    expect(out).toEqual({ name: null, bridge: null, hwaddr: null, ip: null, gw: null });
  });
});

describe("GET /api/proxmox/lxcs/[vmid]", () => {
  test("401 unauthed", async () => {
    authResult = null;
    const res = await GET(req() as never, { params: Promise.resolve({ vmid: "100" }) });
    expect(res.status).toBe(401);
  });

  test("400 on non-numeric vmid", async () => {
    authResult = { user: { login: "alice" } };
    const res = await GET(req() as never, {
      params: Promise.resolve({ vmid: "../etc/passwd" }),
    });
    expect(res.status).toBe(400);
  });

  test("200 happy path with parsed network", async () => {
    authResult = { user: { login: "alice" } };
    pveGetImpl = async (path: string) => {
      if (path.endsWith("/config"))
        return {
          net0: "name=eth0,bridge=vmbr0,hwaddr=BC:24:11:00:00:00,ip=10.10.20.100/24,gw=10.10.20.1",
          hostname: "docker-tower",
        };
      if (path.endsWith("/status/current"))
        return { status: "running", uptime: 3600 };
      throw new Error("unexpected " + path);
    };
    const res = await GET(req() as never, { params: Promise.resolve({ vmid: "100" }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { network: { ip: string; bridge: string } };
    };
    expect(body.data.network.ip).toBe("10.10.20.100/24");
    expect(body.data.network.bridge).toBe("vmbr0");
  });

  test("502 PVE_UNREACHABLE on tower down", async () => {
    authResult = { user: { login: "alice" } };
    pveGetImpl = async () => {
      throw new PveError("PVE_UNREACHABLE", 0, "tower unreachable");
    };
    const res = await GET(req() as never, { params: Promise.resolve({ vmid: "100" }) });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("PVE_UNREACHABLE");
  });
});
