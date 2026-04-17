import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PayloadCell } from "./PayloadCell";
import type { AuditRow } from "../page";

// ---------------------------------------------------------------------------
// Relative-time helper — no external deps, simple branches
// ---------------------------------------------------------------------------
function relativeTime(isoString: string): string {
  const t = new Date(isoString);
  const diffSec = Math.floor((Date.now() - t.getTime()) / 1000);

  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 7 * 86400) return "Yesterday";

  // Older: format as "Apr 15"
  return t.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
type Props = {
  rows: AuditRow[];
  before: number | null;
  pageSize: number;
};

export function AuditTable({ rows, before, pageSize }: Props) {
  // Empty state: no rows on first page
  if (rows.length === 0 && before === null) {
    return (
      <div className="py-12 text-center space-y-2">
        <h2 className="text-xl font-semibold">No audit entries yet</h2>
        <p className="text-sm text-muted-foreground">
          Administrative mutations will appear here. The log is append-only and
          survives container rebuilds.
        </p>
      </div>
    );
  }

  const oldestId = rows.length > 0 ? rows[rows.length - 1].id : null;
  const hasOlder = rows.length === pageSize;
  const hasNewer = before !== null;

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-36">Time</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Payload</TableHead>
            <TableHead>IP</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <time
                  dateTime={row.created_at}
                  aria-label={row.created_at}
                  className="text-sm text-muted-foreground"
                >
                  {relativeTime(row.created_at)}
                </time>
              </TableCell>
              <TableCell className="text-sm">{row.user}</TableCell>
              <TableCell className="font-mono text-xs">{row.action}</TableCell>
              <TableCell className="font-mono text-xs">
                {row.target ?? <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell>
                <PayloadCell json={row.payload_json} />
              </TableCell>
              <TableCell className="text-sm">
                {row.ip ?? <span className="text-muted-foreground">—</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Pagination footer */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">50 per page</span>
        <div className="flex gap-4">
          {hasNewer && (
            <a
              href="/audit"
              className="text-sm text-primary hover:underline"
            >
              ← Newer
            </a>
          )}
          {hasOlder && oldestId !== null && (
            <a
              href={`/audit?before=${oldestId}`}
              className="text-sm text-primary hover:underline"
            >
              Older →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
