import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { pveGet, PveError } from "@/lib/proxmox.server";
import { sanitizeErrorMessage } from "@/lib/redact.server";

export const runtime = "nodejs";

const VmidSchema = z.object({
  vmid: z.string().regex(/^\d+$/),
});

type PveTask = {
  upid: string;
  type?: string;
  status?: string;
  starttime?: number;
  endtime?: number;
  user?: string;
  node?: string;
  [k: string]: unknown;
};

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ vmid: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.login) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = VmidSchema.safeParse(await context.params);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid vmid" }, { status: 400 });
  }
  const { vmid } = parsed.data;

  try {
    const tasks = await pveGet<PveTask[]>(
      `/nodes/tower/tasks?vmid=${vmid}&limit=20`,
    );
    return NextResponse.json({ data: tasks });
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
