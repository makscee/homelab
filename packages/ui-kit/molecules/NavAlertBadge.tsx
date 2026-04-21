"use client";

import Link from "next/link";
import type { JSX } from "react";

/**
 * NavAlertBadge — top-bar firing-count badge. Hidden entirely when zero
 * alerts firing; otherwise a destructive pill that links to an alerts page
 * (consumer-configurable via `href`). Uses aria-live so screen-readers
 * announce count changes.
 *
 * The badge is kit-generic: the alert count is passed in via props rather
 * than the kit owning a data hook. Consumers wire their own SWR / polling
 * logic around it.
 */
export interface NavAlertBadgeProps {
  count: number;
  href?: string;
  className?: string;
}

export function NavAlertBadge({
  count,
  href = "/alerts",
  className,
}: NavAlertBadgeProps): JSX.Element | null {
  if (count === 0) return null;
  const base =
    "inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-destructive px-2 text-xs font-semibold text-destructive-foreground hover:bg-destructive/80";
  return (
    <Link
      href={href}
      title={`${count} alerts firing`}
      aria-live="polite"
      className={className ? `${base} ${className}` : base}
    >
      {count}
    </Link>
  );
}
