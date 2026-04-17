"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAlertCount, type AlertCount } from "./useAlertCount";

// --------------------------------------------------------------------------
// Pure helpers (exported for tests)
// --------------------------------------------------------------------------

export type SeverityKey = "critical" | "warning" | "info" | "other";

type SeverityRow = {
  key: SeverityKey;
  name: string;
  count: number;
  variant: "destructive" | "default" | "secondary" | "outline";
};

const SEVERITY_ORDER: SeverityKey[] = ["critical", "warning", "info", "other"];

const SEVERITY_META: Record<
  SeverityKey,
  { name: string; variant: SeverityRow["variant"] }
> = {
  critical: { name: "Critical", variant: "destructive" },
  // UI-SPEC: warning uses amber — expressed via Badge className override at
  // render site (cva default variants don't include amber); we flag it as
  // `default` here for a11y-contrast fallback.
  warning: { name: "Warning", variant: "default" },
  info: { name: "Info", variant: "secondary" },
  other: { name: "Other", variant: "outline" },
};

/**
 * Compact firing count — e.g. 3 → "3 firing". Stays on one line so the big
 * 28px heading stays visually stable between refreshes.
 */
export function formatFiring(total: number): string {
  return `${total} firing`;
}

export function buildSeverityRows(ac: AlertCount): SeverityRow[] {
  return SEVERITY_ORDER.filter((k) => ac.bySeverity[k] > 0).map((k) => ({
    key: k,
    name: SEVERITY_META[k].name,
    count: ac.bySeverity[k],
    variant: SEVERITY_META[k].variant,
  }));
}

// --------------------------------------------------------------------------
// Component
// --------------------------------------------------------------------------

export function AlertsCard() {
  const { data } = useAlertCount();
  const ac: AlertCount = data ?? {
    total: 0,
    bySeverity: { critical: 0, warning: 0, info: 0, other: 0 },
    healthy: true,
  };
  const rows = buildSeverityRows(ac);
  const tooltip = ac.healthy === false ? "Prometheus unreachable" : undefined;

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Alerts
        </h2>
        <Link
          href="/alerts"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          View all →
        </Link>
      </div>
      <Link
        href="/alerts"
        title={tooltip}
        className="block focus:outline-none focus:ring-2 focus:ring-ring rounded-lg"
      >
        <Card className="transition-colors hover:bg-accent/40">
          <CardHeader className="pb-3">
            <h3 className="text-base font-semibold">Alerts</h3>
          </CardHeader>
          <CardContent>
            {ac.total === 0 ? (
              <p
                className="text-sm text-muted-foreground"
                aria-live="polite"
              >
                All clear
              </p>
            ) : (
              <div className="space-y-3">
                <div
                  className="text-2xl font-semibold tabular-nums"
                  aria-live="polite"
                >
                  {formatFiring(ac.total)}
                </div>
                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    By severity
                  </div>
                  <ul className="space-y-1">
                    {rows.map((r) => (
                      <li
                        key={r.key}
                        className="flex items-center justify-between text-sm"
                        data-severity={r.key}
                      >
                        <Badge
                          variant={r.variant}
                          className={
                            r.key === "warning"
                              ? "bg-amber-500 text-white hover:bg-amber-500/80"
                              : undefined
                          }
                        >
                          {r.name}
                        </Badge>
                        <span className="tabular-nums">{r.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </Link>
    </section>
  );
}
