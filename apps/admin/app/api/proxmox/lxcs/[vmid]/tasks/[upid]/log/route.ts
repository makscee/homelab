import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { pveGet, PveError } from "@/lib/proxmox.server";
import { sanitizeErrorMessage } from "@/lib/redact.server";

export const runtime = "nodejs";

const ParamsSchema = z.object({
  vmid: z.string().regex(/^\d+$/),
  // PVE UPIDs look like:
  //   UPID:tower:00001F23:00ABCDEF:651F1234:qmstart:100:root@pam:
  // Allow colons, alphanumerics, dash, underscore, dot.
  upid: z.string().regex(/^UPID:[A-Za-z0-9:_.\-@]+$/),
});

type PveLogLine = { n?: number; t?: string; [k: string]: unknown };

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ vmid: string; upid: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.login) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = ParamsSchema.safeParse(await context.params);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid params" }, { status: 400 });
  }
  const { upid } = parsed.data;

  try {
    // Pitfall #5: encodeURIComponent so the colons in UPID don't get
    // re-interpreted as URL authority separators when joined with the base.
    const lines = await pveGet<PveLogLine[]>(
      `/nodes/tower/tasks/${encodeURIComponent(upid)}/log?start=0&limit=500`,
    );
    return NextResponse.json({ data: lines });
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
