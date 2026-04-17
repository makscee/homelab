"use client";

import Link from "next/link";
import { useAlertCount } from "./useAlertCount";

/**
 * Top-bar firing-count badge. Hidden entirely when zero alerts firing;
 * otherwise a destructive pill that links to /alerts. Uses aria-live so
 * screen-readers announce count changes.
 */
export function NavAlertBadge() {
  const { data } = useAlertCount();
  const count = data?.total ?? 0;
  if (count === 0) return null;
  return (
    <Link
      href="/alerts"
      title={`${count} alerts firing`}
      aria-live="polite"
      className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-destructive px-2 text-xs font-semibold text-destructive-foreground hover:bg-destructive/80"
    >
      {count}
    </Link>
  );
}
