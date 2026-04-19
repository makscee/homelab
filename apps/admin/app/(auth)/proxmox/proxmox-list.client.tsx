"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

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

export type LxcRow = {
  vmid: string;
  name?: string;
  status?: string;
  cpus?: number;
  maxmem?: number;
  uptime?: number;
  [k: string]: unknown;
};

type ErrorState = { code: string } | null;

const POLL_MS = 10_000;

function formatMem(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  const gib = bytes / (1024 * 1024 * 1024);
  if (gib >= 1) return `${gib.toFixed(1)} GiB`;
  const mib = bytes / (1024 * 1024);
  return `${mib.toFixed(0)} MiB`;
}

function formatUptime(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
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

export function ProxmoxList({
  initialData,
  initialError,
}: {
  initialData: LxcRow[];
  initialError: ErrorState;
}) {
  const [data, setData] = useState<LxcRow[]>(initialData);
  const [error, setError] = useState<ErrorState>(initialError);
  const [lastFetched, setLastFetched] = useState<Date | null>(
    initialError ? null : new Date(),
  );
  const [isFetching, setIsFetching] = useState(false);
  const mountedRef = useRef(true);

  const refetch = useCallback(async () => {
    setIsFetching(true);
    try {
      const resp = await fetch("/api/proxmox/lxcs", {
        credentials: "include",
        cache: "no-store",
      });
      if (!resp.ok) {
        let code = "PVE_HTTP";
        try {
          const body = (await resp.json()) as { code?: string };
          if (body && typeof body.code === "string") code = body.code;
        } catch {
          // ignore
        }
        if (mountedRef.current) setError({ code });
        return;
      }
      const body = (await resp.json()) as { data: LxcRow[] };
      if (mountedRef.current) {
        setData(body.data ?? []);
        setError(null);
        setLastFetched(new Date());
      }
    } catch {
      if (mountedRef.current) setError({ code: "PVE_UNREACHABLE" });
    } finally {
      if (mountedRef.current) setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const id = setInterval(refetch, POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [refetch]);

  const sorted = [...data].sort((a, b) => {
    const av = Number(a.vmid) || 0;
    const bv = Number(b.vmid) || 0;
    return av - bv;
  });

  return (
    <div className="space-y-4">
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

      {sorted.length === 0 && !error ? (
        <div className="py-12 text-center space-y-2">
          <h2 className="text-lg font-semibold">No LXCs returned</h2>
          <p className="text-sm text-muted-foreground">
            The Proxmox API returned an empty list.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">VMID</TableHead>
              <TableHead>Hostname</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-20">CPUs</TableHead>
              <TableHead className="w-28">Memory</TableHead>
              <TableHead className="w-28">Uptime</TableHead>
              <TableHead className="w-20 text-right">Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((row) => {
              const statusLabel = row.status ?? "unknown";
              const isRunning = statusLabel === "running";
              return (
                <TableRow key={row.vmid}>
                  <TableCell className="font-mono text-xs">
                    {row.vmid}
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.name ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={isRunning ? "default" : "secondary"}
                      className={
                        isRunning
                          ? "bg-emerald-600 text-white hover:bg-emerald-600/90"
                          : undefined
                      }
                    >
                      {statusLabel}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.cpus ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatMem(row.maxmem)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatUptime(row.uptime)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/proxmox/${row.vmid}`}
                      className="text-sm text-primary hover:underline"
                    >
                      View →
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
