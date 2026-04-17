import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { verifyCsrf, CsrfError } from "@/lib/csrf.server";
import { sopsAvailable } from "@/lib/sops.server";
import { softDeleteToken } from "@/lib/token-registry.server";

export const runtime = "nodejs";

const ParamsSchema = z.object({ id: z.string().uuid() });

function sanitizeErrorMessage(msg: string): string {
  return msg.startsWith("sk-ant-oat01-") ? "server error" : msg;
}

// Next.js 15 — params is a Promise. Resolve before anything else so `id`
// is available to all downstream checks (including 401/403 branches where
// returning early without resolving would still be a contract violation).
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const rawParams = await ctx.params;
  const paramsParsed = ParamsSchema.safeParse(rawParams);
  if (!paramsParsed.success) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const { id } = paramsParsed.data;

  const session = await auth();
  if (!session?.user?.login) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    verifyCsrf(req);
  } catch (e) {
    if (e instanceof CsrfError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw e;
  }

  if (!sopsAvailable()) {
    return NextResponse.json({ error: "sops unavailable" }, { status: 503 });
  }

  try {
    await softDeleteToken(id, session.user.login);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const raw = e instanceof Error ? e.message : "server error";
    return NextResponse.json({ error: sanitizeErrorMessage(raw) }, { status: 400 });
  }
}
