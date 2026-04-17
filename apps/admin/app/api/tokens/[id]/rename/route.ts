import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { verifyCsrf, CsrfError } from "@/lib/csrf.server";
import { sanitizeErrorMessage } from "@/lib/redact.server";
import { sopsAvailable } from "@/lib/sops.server";
import { renameToken, TokenNotFoundError } from "@/lib/token-registry.server";

export const runtime = "nodejs";

const ParamsSchema = z.object({ id: z.string().uuid() });

const InputSchema = z.object({
  label: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/),
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
    const result = await renameToken(id, parsed.data.label, session.user.login);
    return NextResponse.json({ ok: true, token: result });
  } catch (e) {
    if (e instanceof TokenNotFoundError) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const raw = e instanceof Error ? e.message : "server error";
    return NextResponse.json({ error: sanitizeErrorMessage(raw) }, { status: 400 });
  }
}
