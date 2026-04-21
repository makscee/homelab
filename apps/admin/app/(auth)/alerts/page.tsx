import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertsTable } from "./_components/AlertsTable";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  // Server-side only — never exposed as NEXT_PUBLIC_* (T-20-01-04).
  // Plan 02's ansible task renders ALERTMANAGER_URL into /etc/homelab-admin/env.
  const alertmanagerUrl =
    process.env.ALERTMANAGER_URL ?? "http://docker-tower:9093";

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Alerts</h1>
        <Button asChild variant="ghost" size="sm">
          <a href={alertmanagerUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            Open Alertmanager
          </a>
        </Button>
      </header>
      <AlertsTable />
    </div>
  );
}
