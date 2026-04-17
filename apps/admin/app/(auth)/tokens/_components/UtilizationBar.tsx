import { cn } from "@/lib/utils";
import { thresholdClass } from "../_lib/view-model";

type Props = {
  label: "5h" | "7d";
  value: number | null; // 0-100; null = no sample
};

/**
 * Inline progress bar with a trailing percentage label. Color follows the
 * UI-SPEC threshold map:
 *   <  80% -> --primary  (accent/safe)
 *   >= 80% -> amber-500  (warn)
 *   >= 95% -> --destructive
 *
 * Color is never the sole signal: the raw % ("62%") is always rendered to
 * the right, and aria-label includes the numeric value.
 *
 * `null` renders a muted empty track with "—" — this is the "waiting for
 * first poll" state (D-13-10 inline placeholder).
 */
export function UtilizationBar({ label, value }: Props) {
  if (value === null) {
    return (
      <div className="flex items-center gap-2">
        <div
          role="progressbar"
          aria-label={`${label} usage: pending`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={0}
          className="h-2 w-32 rounded bg-muted"
        />
        <span className="text-xs text-muted-foreground tabular-nums">—</span>
      </div>
    );
  }
  const clamped = Math.min(100, Math.max(0, value));
  const cls = thresholdClass(clamped);
  const fill =
    cls === "critical"
      ? "bg-destructive"
      : cls === "warn"
        ? "bg-amber-500"
        : "bg-primary";
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-label={`${label} usage: ${clamped.toFixed(0)}%`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        className="h-2 w-32 overflow-hidden rounded bg-muted"
      >
        <div className={cn("h-full", fill)} style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-xs tabular-nums">{clamped.toFixed(0)}%</span>
    </div>
  );
}
