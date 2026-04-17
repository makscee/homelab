import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { verifyCsrf, CsrfError } from "@/lib/csrf.server";
import { sanitizeErrorMessage } from "@/lib/redact.server";
import { sopsAvailable } from "@/lib/sops.server";
import { rotateToken, TokenNotFoundError } from "@/lib/token-registry.server";
import { logAudit } from "@/lib/audit.server";

export const runtime = "nodejs";

const ParamsSchema = z.object({ id: z.string().uuid() });

const InputSchema = z.object({
  value: z.string().regex(/^sk-ant-oat01-[A-Za-z0-9_-]+$/),
});

export async function POST(
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

  const body = await req.json().catch(() => null);
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await rotateToken(id, parsed.data.value, session.user.login);
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      undefined;
    logAudit({
      action: "token.rotate",
      target: id,
      payload: { rotated_at: result.rotated_at },
      user: session.user.login,
      ip,
    });
    return NextResponse.json({ ok: true, token: result });
  } catch (e) {
    if (e instanceof TokenNotFoundError) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const raw = e instanceof Error ? e.message : "server error";
    return NextResponse.json({ error: sanitizeErrorMessage(raw) }, { status: 400 });
  }
}
