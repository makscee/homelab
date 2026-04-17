import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { getTokenById } from "@/lib/token-registry.server";
import { queryRange } from "@/lib/prometheus.server";
import { sopsAvailable } from "@/lib/sops.server";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { DetailChart } from "./_components/DetailChart";
import { RowActions } from "../_components/RowActions";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export default async function TokenDetailPage({ params }: Params) {
  const { id } = await params;
  const entry = await getTokenById(id);
  if (!entry) notFound();

  const writeAvailable = sopsAvailable();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

  // Label is restricted to `[A-Za-z0-9._-]+` by the AddToken/Rename Zod
  // schemas, so the only chars we still need to defend against injection-wise
  // are quotes — which can't appear in a valid label. Belt-and-suspenders:
  // escape just in case the registry was hand-edited out-of-band.
  const safeLabel = entry.label.replace(/"/g, '\\"');
  // Exporter publishes `claude_usage_7d_utilization` (0..1) with a `name`
  // label (see servers/mcow/claude-usage-exporter/exporter.py). Multiply by
  // 100 so DetailChart keeps operating in the 0..100 space.
  const promql = `claude_usage_7d_utilization{name="${safeLabel}"} * 100`;
  const series = await queryRange(promql, sevenDaysAgo, now, 3600, {
    revalidateSec: 60,
  }).catch(() => []);
  const samples = series[0]?.samples ?? [];

  return (
    <div className="p-8">
      <nav
        aria-label="Breadcrumb"
        className="mb-4 flex items-center gap-1 text-sm text-muted-foreground"
      >
        <Link href="/tokens" className="hover:underline">
          Tokens
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">{entry.label}</span>
      </nav>

      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-semibold">{entry.label}</h1>
          <Badge variant="secondary">{entry.tier}</Badge>
          <span className="text-sm text-muted-foreground">
            {entry.owner_host}
          </span>
          {entry.enabled ? (
            <Badge variant="secondary">Enabled</Badge>
          ) : (
            <Badge variant="outline">Disabled</Badge>
          )}
        </div>
        <RowActions
          id={entry.id}
          label={entry.label}
          enabled={entry.enabled}
          disabled={!writeAvailable}
        />
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">7-day usage</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailChart samples={samples} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Metadata</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs uppercase text-muted-foreground">ID</div>
            <div className="font-mono text-xs">{entry.id}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">
              Added
            </div>
            <div className="font-mono text-xs">{entry.added_at}</div>
          </div>
          {entry.rotated_at && (
            <div>
              <div className="text-xs uppercase text-muted-foreground">
                Rotated
              </div>
              <div className="font-mono text-xs">{entry.rotated_at}</div>
            </div>
          )}
          {entry.notes && (
            <div className="col-span-2">
              <div className="text-xs uppercase text-muted-foreground">
                Notes
              </div>
              <div>{entry.notes}</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
