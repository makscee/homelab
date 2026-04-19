import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { pveGet, PveError } from "@/lib/proxmox.server";
import { sanitizeErrorMessage } from "@/lib/redact.server";

// CA pinning via undici Agent requires Node runtime (not Edge).
export const runtime = "nodejs";

// Minimal shape of an LXC stub from /nodes/{node}/lxc. We keep this tolerant
// (extra fields passed through) because Plan 03 may consume additional PVE
// fields without another schema hop.
type LxcStub = {
  vmid: string | number;
  name?: string;
  status?: string;
  maxmem?: number;
  maxdisk?: number;
  [k: string]: unknown;
};

// Live stats from /nodes/{node}/lxc/{vmid}/status/current.
type LxcStatus = {
  cpu?: number;
  cpus?: number;
  mem?: number;
  uptime?: number;
  [k: string]: unknown;
};

type LxcSummary = LxcStub & LxcStatus;

function vmidStr(v: unknown): string {
  return typeof v === "number" ? String(v) : String(v ?? "");
}

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.login) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const stubs = await pveGet<LxcStub[]>("/nodes/tower/lxc");
    const merged: LxcSummary[] = await Promise.all(
      stubs.map(async (s) => {
        const vmid = vmidStr(s.vmid);
        try {
          const live = await pveGet<LxcStatus>(
            `/nodes/tower/lxc/${vmid}/status/current`,
          );
          return { ...s, ...live, vmid };
        } catch {
          // Per-vmid stat fetch failing must not poison the list response.
          // Return the stub with just the vmid normalized.
          return { ...s, vmid };
        }
      }),
    );
    return NextResponse.json({ data: merged });
  } catch (e) {
    if (e instanceof PveError) {
      if (e.code === "PVE_UNREACHABLE") {
        return NextResponse.json(
          { error: "tower unreachable", code: "PVE_UNREACHABLE" },
          { status: 502 },
        );
      }
      return NextResponse.json(
        { error: "proxmox error", code: e.code },
        { status: 502 },
      );
    }
    const raw = e instanceof Error ? e.message : "server error";
    return NextResponse.json(
      { error: sanitizeErrorMessage(raw) },
      { status: 502 },
    );
  }
}
