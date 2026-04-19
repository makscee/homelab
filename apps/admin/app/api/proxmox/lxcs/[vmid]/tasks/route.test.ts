import { describe, test, expect, beforeEach, mock } from "bun:test";

let authResult: { user?: { login?: string } } | null = null;
let pveGetImpl: (path: string) => Promise<unknown> = async () => [];
const seenPaths: string[] = [];

mock.module("@/auth", () => ({ auth: async () => authResult }));
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
    parseNet0: () => ({ name: null, bridge: null, hwaddr: null, ip: null, gw: null }),
  };
});

const { GET } = await import("./route");
const { PveError } = await import("@/lib/proxmox.server");

function req(): Request {
  return new Request("https://homelab.makscee.ru/x");
}

beforeEach(() => {
  authResult = null;
  seenPaths.length = 0;
  pveGetImpl = async () => [];
});

describe("GET /api/proxmox/lxcs/[vmid]/tasks", () => {
  test("401 unauthed", async () => {
    const res = await GET(req() as never, { params: Promise.resolve({ vmid: "100" }) });
    expect(res.status).toBe(401);
  });

  test("400 bad vmid", async () => {
    authResult = { user: { login: "alice" } };
    const res = await GET(req() as never, { params: Promise.resolve({ vmid: "abc" }) });
    expect(res.status).toBe(400);
  });

  test("200 returns data list and requests vmid-filtered path with limit=20", async () => {
    authResult = { user: { login: "alice" } };
    pveGetImpl = async () => [
      { upid: "UPID:tower:abc:111:qmstart:100:root@pam:", type: "vzstart" },
    ];
    const res = await GET(req() as never, { params: Promise.resolve({ vmid: "100" }) });
    expect(res.status).toBe(200);
    expect(seenPaths[0]).toBe("/nodes/tower/tasks?vmid=100&limit=20");
    const body = (await res.json()) as { data: Array<{ upid: string }> };
    expect(body.data.length).toBe(1);
  });

  test("502 PVE_UNREACHABLE", async () => {
    authResult = { user: { login: "alice" } };
    pveGetImpl = async () => {
      throw new PveError("PVE_UNREACHABLE", 0, "tower unreachable");
    };
    const res = await GET(req() as never, { params: Promise.resolve({ vmid: "100" }) });
    expect(res.status).toBe(502);
  });
});
