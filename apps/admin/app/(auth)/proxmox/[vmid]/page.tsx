import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { auth } from "@/auth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ProxmoxDetail,
  type DetailPayload,
  type TaskRow,
} from "./proxmox-detail.client";

export const dynamic = "force-dynamic";

type FetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; status: number };

async function fetchJson<T>(
  path: string,
  cookie: string,
  host: string,
  proto: string,
): Promise<FetchResult<T>> {
  try {
    const url = `${proto}://${host}${path}`;
    const resp = await fetch(url, {
      headers: { cookie },
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
      return { ok: false, code, status: resp.status };
    }
    const body = (await resp.json()) as { data: T };
    return { ok: true, data: body.data };
  } catch {
    return { ok: false, code: "PVE_UNREACHABLE", status: 0 };
  }
}

export default async function ProxmoxDetailPage({
  params,
}: {
  params: Promise<{ vmid: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { vmid } = await params;
  if (!/^\d+$/.test(vmid)) {
    return (
      <div className="p-8 space-y-6">
        <Link
          href="/proxmox"
          className="text-sm text-primary hover:underline"
        >
          ← Back to Proxmox list
        </Link>
        <Alert variant="destructive">
          <AlertTitle>Invalid vmid</AlertTitle>
          <AlertDescription>
            The vmid must be numeric.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const hdrs = await headers();
  const host = hdrs.get("host") ?? "127.0.0.1:3847";
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const cookie = hdrs.get("cookie") ?? "";

  const [detail, tasks] = await Promise.all([
    fetchJson<DetailPayload>(`/api/proxmox/lxcs/${vmid}`, cookie, host, proto),
    fetchJson<TaskRow[]>(
      `/api/proxmox/lxcs/${vmid}/tasks`,
      cookie,
      host,
      proto,
    ),
  ]);

  return (
    <div className="p-8 space-y-6">
      <Link
        href="/proxmox"
        className="text-sm text-primary hover:underline"
      >
        ← Back to Proxmox list
      </Link>
      <header className="space-y-2">
        <h1 className="text-xl font-semibold">
          LXC {vmid}
          {detail.ok && typeof detail.data.config?.hostname === "string"
            ? ` — ${detail.data.config.hostname}`
            : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          Read-only view. Auto-refreshes every 30 seconds.
        </p>
      </header>
      <ProxmoxDetail
        vmid={vmid}
        initialDetail={detail.ok ? detail.data : null}
        initialTasks={tasks.ok ? tasks.data : []}
        initialError={
          detail.ok
            ? null
            : { code: detail.code }
        }
      />
    </div>
  );
}
