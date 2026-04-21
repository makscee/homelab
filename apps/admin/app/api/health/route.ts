import { NextResponse } from "next/server";

const startedAt = Date.now();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/health — dual-format health probe.
 *
 * - Default / browser / curl: JSON body `{ ok, version, commit_sha, uptime_s }`.
 * - Prometheus scrape (Accept includes `text/plain` or `openmetrics`):
 *   Prometheus text format exposition with `homelab_admin_up 1` so the scrape
 *   parses cleanly and the `up{job="homelab-admin"}` series populates (D-22-17,
 *   plan 22-06 self-monitoring).
 */
export async function GET(req: Request) {
  const accept = (req.headers.get("accept") ?? "").toLowerCase();
  const wantsProm =
    accept.includes("text/plain") || accept.includes("openmetrics");

  const uptimeS = Math.floor((Date.now() - startedAt) / 1000);
  const version = process.env.npm_package_version ?? "0.0.0";
  const commitSha = process.env.HOMELAB_ADMIN_COMMIT_SHA ?? "unknown";

  if (wantsProm) {
    const body = [
      "# HELP homelab_admin_up Health of homelab-admin (1 = up).",
      "# TYPE homelab_admin_up gauge",
      "homelab_admin_up 1",
      "# HELP homelab_admin_uptime_seconds Process uptime in seconds.",
      "# TYPE homelab_admin_uptime_seconds gauge",
      `homelab_admin_uptime_seconds ${uptimeS}`,
      "",
    ].join("\n");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json(
    {
      ok: true,
      version,
      commit_sha: commitSha,
      uptime_s: uptimeS,
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
