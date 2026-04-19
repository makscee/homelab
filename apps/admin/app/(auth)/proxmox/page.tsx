import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ProxmoxList, type LxcRow } from "./proxmox-list.client";

export const dynamic = "force-dynamic";

type FetchResult =
  | { ok: true; data: LxcRow[] }
  | { ok: false; code: string; status: number };

async function fetchInitial(): Promise<FetchResult> {
  try {
    const hdrs = await headers();
    const host = hdrs.get("host") ?? "127.0.0.1:3847";
    const proto = hdrs.get("x-forwarded-proto") ?? "http";
    const cookie = hdrs.get("cookie") ?? "";
    const url = `${proto}://${host}/api/proxmox/lxcs`;
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
        // ignore parse errors
      }
      return { ok: false, code, status: resp.status };
    }
    const body = (await resp.json()) as { data: LxcRow[] };
    return { ok: true, data: body.data ?? [] };
  } catch {
    return { ok: false, code: "PVE_UNREACHABLE", status: 0 };
  }
}

export default async function ProxmoxPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const initial = await fetchInitial();

  return (
    <div className="p-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold">Proxmox LXCs (tower)</h1>
        <p className="text-sm text-muted-foreground">
          Read-only view of containers on the tower Proxmox host. Auto-refreshes
          every 10 seconds.
        </p>
      </header>
      <ProxmoxList
        initialData={initial.ok ? initial.data : []}
        initialError={initial.ok ? null : { code: initial.code }}
      />
    </div>
  );
}
