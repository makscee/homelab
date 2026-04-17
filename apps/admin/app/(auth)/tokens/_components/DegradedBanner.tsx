import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Destructive-colored alert pinned above the table when `sopsAvailable()`
 * returns false. Copy verbatim from UI-SPEC §Copywriting Contract §Degraded
 * mode banner (D-13-10). Icon is the lucide AlertTriangle — destructive
 * color inherits from the Alert variant.
 */
export function DegradedBanner() {
  return (
    <Alert variant="destructive" className="mb-6">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Read-only mode</AlertTitle>
      <AlertDescription>
        SOPS write path is unavailable. Existing tokens are shown from the
        exporter&rsquo;s last-known state. Add, rotate, rename, and delete are
        disabled until SOPS recovers.
      </AlertDescription>
    </Alert>
  );
}
