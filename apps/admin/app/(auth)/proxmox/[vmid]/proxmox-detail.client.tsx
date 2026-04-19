"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";

const TaskFragment = Fragment;

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type NetworkInfo = {
  name: string | null;
  bridge: string | null;
  hwaddr: string | null;
  ip: string | null;
  gw: string | null;
};

export type DetailPayload = {
  config: Record<string, unknown>;
  status: Record<string, unknown>;
  network: NetworkInfo;
};

export type TaskRow = {
  upid: string;
  type?: string;
  status?: string;
  starttime?: number;
  endtime?: number;
  user?: string;
  node?: string;
  [k: string]: unknown;
};

type ErrorState = { code: string } | null;

const POLL_MS = 30_000;

function formatStart(unix: number | undefined): string {
  if (!unix || unix <= 0) return "—";
  return new Date(unix * 1000).toLocaleString();
}

function errorMessage(code: string): { title: string; body: string } {
  if (code === "PVE_UNREACHABLE") {
    return {
      title: "Tower unreachable via Tailnet",
      body: "Check tower status. Last-known-good data shown below.",
    };
  }
  if (code === "PVE_AUTH") {
    return {
      title: "Proxmox authentication failed",
      body: "The API token may be expired or misconfigured.",
    };
  }
  return {
    title: "Proxmox request failed",
    body: `Code: ${code}. Last-known-good data shown below.`,
  };
}

export function ProxmoxDetail({
  vmid,
  initialDetail,
  initialTasks,
  initialError,
}: {
  vmid: string;
  initialDetail: DetailPayload | null;
  initialTasks: TaskRow[];
  initialError: ErrorState;
}) {
  const [detail, setDetail] = useState<DetailPayload | null>(initialDetail);
  const [tasks, setTasks] = useState<TaskRow[]>(initialTasks);
  const [error, setError] = useState<ErrorState>(initialError);
  const [lastFetched, setLastFetched] = useState<Date | null>(
    initialError ? null : new Date(),
  );
  const [isFetching, setIsFetching] = useState(false);
  const [expandedUpid, setExpandedUpid] = useState<string | null>(null);
  const [taskLogs, setTaskLogs] = useState<Map<string, string[]>>(new Map());
  const [logLoadingUpid, setLogLoadingUpid] = useState<string | null>(null);
  const [logErrorUpid, setLogErrorUpid] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refetch = useCallback(async () => {
    setIsFetching(true);
    try {
      const [d, t] = await Promise.all([
        fetch(`/api/proxmox/lxcs/${vmid}`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch(`/api/proxmox/lxcs/${vmid}/tasks`, {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      if (!d.ok) {
        let code = "PVE_HTTP";
        try {
          const body = (await d.json()) as { code?: string };
          if (body && typeof body.code === "string") code = body.code;
        } catch {
          // ignore
        }
        if (mountedRef.current) setError({ code });
        return;
      }
      const dBody = (await d.json()) as { data: DetailPayload };
      let tRows: TaskRow[] = [];
      if (t.ok) {
        try {
          const tBody = (await t.json()) as { data: TaskRow[] };
          tRows = tBody.data ?? [];
        } catch {
          tRows = [];
        }
      }
      if (mountedRef.current) {
        setDetail(dBody.data);
        setTasks(tRows);
        setError(null);
        setLastFetched(new Date());
      }
    } catch {
      if (mountedRef.current) setError({ code: "PVE_UNREACHABLE" });
    } finally {
      if (mountedRef.current) setIsFetching(false);
    }
  }, [vmid]);

  useEffect(() => {
    mountedRef.current = true;
    const id = setInterval(refetch, POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [refetch]);

  const toggleTask = useCallback(
    async (upid: string) => {
      if (expandedUpid === upid) {
        setExpandedUpid(null);
        return;
      }
      setExpandedUpid(upid);
      setLogErrorUpid(null);
      if (taskLogs.has(upid)) return;
      setLogLoadingUpid(upid);
      try {
        const resp = await fetch(
          `/api/proxmox/lxcs/${vmid}/tasks/${encodeURIComponent(upid)}/log`,
          { credentials: "include", cache: "no-store" },
        );
        if (!resp.ok) {
          if (mountedRef.current) setLogErrorUpid(upid);
          return;
        }
        const body = (await resp.json()) as {
          data: Array<{ n?: number; t?: string } | string>;
        };
        const lines = (body.data ?? []).map((row) =>
          typeof row === "string" ? row : (row.t ?? ""),
        );
        if (mountedRef.current) {
          setTaskLogs((prev) => {
            const next = new Map(prev);
            next.set(upid, lines);
            return next;
          });
        }
      } catch {
        if (mountedRef.current) setLogErrorUpid(upid);
      } finally {
        if (mountedRef.current) setLogLoadingUpid(null);
      }
    },
    [expandedUpid, taskLogs, vmid],
  );

  const net = detail?.network ?? null;
  const config = detail?.config ?? null;
  const configEntries = config
    ? Object.entries(config).sort(([a], [b]) => a.localeCompare(b))
    : [];

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>{errorMessage(error.code).title}</AlertTitle>
          <AlertDescription>{errorMessage(error.code).body}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {lastFetched
            ? `Last updated ${lastFetched.toLocaleTimeString()}`
            : "Not fetched yet"}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={refetch}
          disabled={isFetching}
        >
          {isFetching ? "Refreshing…" : "Refresh now"}
        </Button>
      </div>

      {/* Network info */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Network</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-5">
          <div>
            <dt className="text-xs text-muted-foreground">Interface</dt>
            <dd className="font-mono text-xs">
              {net?.name ?? <span className="text-muted-foreground">—</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Bridge</dt>
            <dd className="font-mono text-xs">
              {net?.bridge ?? <span className="text-muted-foreground">—</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">MAC</dt>
            <dd className="font-mono text-xs">
              {net?.hwaddr ?? <span className="text-muted-foreground">—</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">IP</dt>
            <dd className="font-mono text-xs">
              {net?.ip ?? <span className="text-muted-foreground">—</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Gateway</dt>
            <dd className="font-mono text-xs">
              {net?.gw ?? <span className="text-muted-foreground">—</span>}
            </dd>
          </div>
        </dl>
      </section>

      {/* Config dump */}
      <section>
        <details className="rounded-md border border-border">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
            Config dump ({configEntries.length} keys)
          </summary>
          {configEntries.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-48">Key</TableHead>
                  <TableHead>Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configEntries.map(([k, v]) => (
                  <TableRow key={k}>
                    <TableCell className="font-mono text-xs">{k}</TableCell>
                    <TableCell className="font-mono text-xs break-all">
                      {typeof v === "object" && v !== null
                        ? JSON.stringify(v)
                        : String(v ?? "")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              No config available.
            </div>
          )}
        </details>
      </section>

      {/* Recent tasks */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Recent Tasks</h2>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No recent tasks for this LXC.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">Start</TableHead>
                <TableHead className="w-40">Type</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead>User</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => {
                const ok = task.status === "OK" || task.status === "stopped";
                const isExpanded = expandedUpid === task.upid;
                return (
                  <TaskFragment key={task.upid}>
                    <TableRow
                      className="cursor-pointer hover:bg-accent/50"
                      onClick={() => toggleTask(task.upid)}
                    >
                      <TableCell className="font-mono text-xs">
                        {formatStart(task.starttime)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {task.type ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={ok ? "default" : "destructive"}
                          className={
                            ok
                              ? "bg-emerald-600 text-white hover:bg-emerald-600/90"
                              : undefined
                          }
                        >
                          {task.status ?? "unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {task.user ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={4} className="bg-muted/30 p-0">
                          {logLoadingUpid === task.upid ? (
                            <div className="px-4 py-3 text-sm text-muted-foreground">
                              Loading log…
                            </div>
                          ) : logErrorUpid === task.upid ? (
                            <div className="px-4 py-3 text-sm text-destructive">
                              Failed to load task log.
                            </div>
                          ) : (
                            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all px-4 py-3 font-mono text-xs">
                              {(taskLogs.get(task.upid) ?? []).join("\n") ||
                                "(empty log)"}
                            </pre>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </TaskFragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
