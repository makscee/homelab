import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

function formatTime(iso: string | undefined): string {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function StaleBanner({ since }: { since?: string }) {
  const hhmm = formatTime(since);
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription>
        Prometheus unreachable — data last updated at {hhmm}. Retrying every
        15s.
      </AlertDescription>
    </Alert>
  );
}
