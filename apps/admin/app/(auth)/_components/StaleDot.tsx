import { cn } from "@/lib/utils";
import type { StaleLevel } from "@/app/(auth)/_lib/overview-view-model";

type Props = { level: StaleLevel; className?: string };

const LEVEL_CLASS: Record<StaleLevel, string> = {
  fresh: "bg-primary",
  stale: "bg-amber-500",
  dead: "bg-destructive",
  unknown: "bg-muted",
};

/**
 * 8×8px circular status dot tied to node_exporter scrape freshness. Color
 * is never the sole signal — the `aria-label` always announces the level,
 * and operator copy next to the dot carries the same information.
 */
export function StaleDot({ level, className }: Props) {
  return (
    <span
      role="img"
      aria-label={`status: ${level}`}
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        LEVEL_CLASS[level],
        className,
      )}
    />
  );
}
