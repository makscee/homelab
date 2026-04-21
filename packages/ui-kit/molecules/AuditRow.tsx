import type { JSX } from "react";
import { TableCell, TableRow } from "../primitives";
import { cn } from "../lib/utils";

/**
 * AuditRow — a single `<tr>` row for an audit_log entry, designed to live
 * inside a Table from `../primitives`.
 *
 * Usage:
 * ```tsx
 * <Table>
 *   <TableHeader>
 *     <TableRow>
 *       <TableHead>Time</TableHead>
 *       <TableHead>User</TableHead>
 *       <TableHead>Action</TableHead>
 *       <TableHead>Target</TableHead>
 *       <TableHead>Payload</TableHead>
 *     </TableRow>
 *   </TableHeader>
 *   <TableBody>
 *     {rows.map((r) => <AuditRow key={r.id} {...r} />)}
 *   </TableBody>
 * </Table>
 * ```
 */
export interface AuditRowProps {
  createdAt: string; // ISO
  user: string;
  action: string;
  target: string;
  payload?: unknown;
  className?: string;
}

function relativeTime(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "—";
  const diffSec = Math.floor((Date.now() - t.getTime()) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 7 * 86400) return "Yesterday";
  return t.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function AuditRow(props: AuditRowProps): JSX.Element {
  const { createdAt, user, action, target, payload, className } = props;

  const payloadStr =
    payload === undefined || payload === null
      ? null
      : typeof payload === "string"
        ? payload
        : JSON.stringify(payload);

  return (
    <TableRow className={cn(className)}>
      <TableCell>
        <time
          dateTime={createdAt}
          aria-label={createdAt}
          className="text-sm text-muted-foreground"
        >
          {relativeTime(createdAt)}
        </time>
      </TableCell>
      <TableCell className="text-sm">{user}</TableCell>
      <TableCell className="font-mono text-xs">{action}</TableCell>
      <TableCell className="font-mono text-xs">
        {target || <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell>
        {payloadStr ? (
          <code className="font-mono text-xs text-muted-foreground line-clamp-1">
            {payloadStr}
          </code>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
