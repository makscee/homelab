import { NextResponse } from "next/server";

const startedAt = Date.now();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      version: process.env.npm_package_version ?? "0.0.0",
      commit_sha: process.env.HOMELAB_ADMIN_COMMIT_SHA ?? "unknown",
      uptime_s: Math.floor((Date.now() - startedAt) / 1000),
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
