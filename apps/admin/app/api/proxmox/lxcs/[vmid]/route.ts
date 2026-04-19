import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { pveGet, PveError, parseNet0 } from "@/lib/proxmox.server";
import { sanitizeErrorMessage } from "@/lib/redact.server";

export const runtime = "nodejs";

const VmidSchema = z.object({
  vmid: z.string().regex(/^\d+$/),
});

type LxcConfig = Record<string, unknown> & { net0?: string };
type LxcStatus = Record<string, unknown>;

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ vmid: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.login) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const raw = await context.params;
  const parsed = VmidSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid vmid" }, { status: 400 });
  }
  const { vmid } = parsed.data;

  try {
    const [config, status] = await Promise.all([
      pveGet<LxcConfig>(`/nodes/tower/lxc/${vmid}/config`),
      pveGet<LxcStatus>(`/nodes/tower/lxc/${vmid}/status/current`),
    ]);
    const network = parseNet0(typeof config.net0 === "string" ? config.net0 : undefined);
    return NextResponse.json({ data: { config, status, network } });
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
    const msg = e instanceof Error ? e.message : "server error";
    return NextResponse.json({ error: sanitizeErrorMessage(msg) }, { status: 502 });
  }
}
