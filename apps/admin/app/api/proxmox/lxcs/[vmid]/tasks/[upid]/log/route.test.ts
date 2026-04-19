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

const GOOD_UPID = "UPID:tower:00001F23:00ABCDEF:651F1234:vzstart:100:root@pam:";

describe("GET /api/proxmox/lxcs/[vmid]/tasks/[upid]/log", () => {
  test("401 unauthed", async () => {
    const res = await GET(req() as never, {
      params: Promise.resolve({ vmid: "100", upid: GOOD_UPID }),
    });
    expect(res.status).toBe(401);
  });

  test("400 invalid upid format", async () => {
    authResult = { user: { login: "alice" } };
    const res = await GET(req() as never, {
      params: Promise.resolve({ vmid: "100", upid: "not-a-upid" }),
    });
    expect(res.status).toBe(400);
  });

  test("400 invalid vmid", async () => {
    authResult = { user: { login: "alice" } };
    const res = await GET(req() as never, {
      params: Promise.resolve({ vmid: "abc", upid: GOOD_UPID }),
    });
    expect(res.status).toBe(400);
  });

  test("200 encodes upid in upstream path", async () => {
    authResult = { user: { login: "alice" } };
    pveGetImpl = async () => [{ n: 1, t: "starting" }];
    const res = await GET(req() as never, {
      params: Promise.resolve({ vmid: "100", upid: GOOD_UPID }),
    });
    expect(res.status).toBe(200);
    // Must have called pveGet with encodeURIComponent(upid)
    expect(seenPaths[0]).toContain(encodeURIComponent(GOOD_UPID));
    // Raw colons must NOT appear in the encoded upid segment.
    const encoded = seenPaths[0].split("/tasks/")[1].split("/log")[0];
    expect(encoded).not.toContain(":");
  });

  test("502 PVE_UNREACHABLE", async () => {
    authResult = { user: { login: "alice" } };
    pveGetImpl = async () => {
      throw new PveError("PVE_UNREACHABLE", 0, "tower unreachable");
    };
    const res = await GET(req() as never, {
      params: Promise.resolve({ vmid: "100", upid: GOOD_UPID }),
    });
    expect(res.status).toBe(502);
  });
});
