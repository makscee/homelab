import Link from "next/link";
import { MoreVertical } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TokenRow } from "../_lib/view-model";
import { UtilizationBar } from "./UtilizationBar";
import { ResetCountdown } from "./ResetCountdown";
import { Sparkline } from "./Sparkline";

type Props = { rows: TokenRow[]; writeAvailable: boolean };

/**
 * Server-rendered table of registry entries. Columns per UI-SPEC:
 *   Label · Tier · Owner · 5h usage · 7d usage · Resets in · 7-day trend · State · (kebab)
 *
 * Row height fixed at 56px (`h-14`) so skeleton → data transitions don't
 * shift layout. Kebab is disabled when `writeAvailable` is false (degraded
 * mode from D-13-10). Mutation handlers land in Plan 13-05.
 *
 * Empty state renders the UI-SPEC `No tokens yet` heading + body block.
 */
export function TokensTable({ rows, writeAvailable }: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <h2 className="text-xl font-semibold">No tokens yet</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Add your first Claude Code OAuth token to start tracking usage. Paste
          the token value &mdash; it will be encrypted with SOPS before it
          touches disk.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Label</TableHead>
          <TableHead>Tier</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead>5h usage</TableHead>
          <TableHead>7d usage</TableHead>
          <TableHead>Resets in</TableHead>
          <TableHead>7-day trend</TableHead>
          <TableHead>State</TableHead>
          <TableHead aria-label="Row actions" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.entry.id} className="h-14">
            <TableCell>
              <Link
                href={`/tokens/${row.entry.id}`}
                className="font-medium hover:underline"
              >
                {row.entry.label}
              </Link>
            </TableCell>
            <TableCell>
              <Badge variant="secondary">{row.entry.tier}</Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {row.entry.owner_host}
            </TableCell>
            <TableCell>
              <UtilizationBar label="5h" value={row.pct5h} />
            </TableCell>
            <TableCell>
              <UtilizationBar label="7d" value={row.pct7d} />
            </TableCell>
            <TableCell>
              <ResetCountdown seconds={row.resetSecondsFiveHour} />
            </TableCell>
            <TableCell>
              <Sparkline samples={row.sparkline} />
            </TableCell>
            <TableCell>
              {row.entry.enabled ? (
                <Badge variant="secondary">Enabled</Badge>
              ) : (
                <Badge variant="outline">Disabled</Badge>
              )}
            </TableCell>
            <TableCell>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Row actions"
                disabled={!writeAvailable}
                aria-disabled={!writeAvailable ? "true" : undefined}
                className="h-8 w-8"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
