import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { verifyCsrf, CsrfError } from "@/lib/csrf.server";
import { sanitizeErrorMessage } from "@/lib/redact.server";
import { sopsAvailable } from "@/lib/sops.server";
import { addToken } from "@/lib/token-registry.server";
import { logAudit } from "@/lib/audit.server";

// sops spawns child processes — the Edge runtime cannot do that, so pin
// this handler to Node. Every other route in this tree does the same.
export const runtime = "nodejs";

const InputSchema = z.object({
  label: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/),
  value: z.string().regex(/^sk-ant-oat01-[A-Za-z0-9_-]+$/),
  tier: z.enum(["pro", "max", "enterprise"]),
  owner_host: z.string().min(1).max(64),
  notes: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  // 1. AuthN/AuthZ — return 401 BEFORE CSRF so unauthed probes can't learn
  // whether CSRF semantics are in play.
  const session = await auth();
  if (!session?.user?.login) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. CSRF — double-submit cookie + Origin check.
  try {
    verifyCsrf(req);
  } catch (e) {
    if (e instanceof CsrfError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw e;
  }

  // 3. Degraded mode — SOPS binary missing.
  if (!sopsAvailable()) {
    return NextResponse.json({ error: "sops unavailable" }, { status: 503 });
  }

  // 4. Input validation.
  const body = await req.json().catch(() => null);
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // 5. Execute.
  try {
    const result = await addToken(parsed.data, session.user.login);
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      undefined;
    logAudit({
      action: "token.add",
      target: result.id,
      payload: {
        label: parsed.data.label,
        owner_host: parsed.data.owner_host,
        tier: parsed.data.tier,
        enabled: true,
      },
      user: session.user.login,
      ip,
    });
    return NextResponse.json({ ok: true, token: result });
  } catch (e) {
    const raw = e instanceof Error ? e.message : "server error";
    return NextResponse.json({ error: sanitizeErrorMessage(raw) }, { status: 400 });
  }
}
