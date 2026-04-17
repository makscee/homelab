import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { verifyCsrf, CsrfError } from "@/lib/csrf.server";
import { sanitizeErrorMessage } from "@/lib/redact.server";
import { sopsAvailable } from "@/lib/sops.server";
import { softDeleteToken, getTokenById, TokenNotFoundError } from "@/lib/token-registry.server";
import { logAudit } from "@/lib/audit.server";

export const runtime = "nodejs";

const ParamsSchema = z.object({ id: z.string().uuid() });

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
    // Fetch label before delete so payload can record deleted_label
    const existing = await getTokenById(id);
    await softDeleteToken(id, session.user.login);
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      undefined;
    logAudit({
      action: "token.delete",
      target: id,
      payload: { deleted_label: existing?.label ?? id },
      user: session.user.login,
      ip,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TokenNotFoundError) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const raw = e instanceof Error ? e.message : "server error";
    return NextResponse.json({ error: sanitizeErrorMessage(raw) }, { status: 400 });
  }
}
