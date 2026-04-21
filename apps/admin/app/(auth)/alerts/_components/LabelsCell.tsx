"use client";

import { useState } from "react";

export function LabelsCell({ labels }: { labels: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(labels);
  const count = entries.length;

  if (count === 0) return <span className="text-muted-foreground">—</span>;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={false}
      >
        {count} labels
      </button>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        {entries.map(([k, v]) => (
          <span
            key={k}
            className="text-xs bg-secondary rounded px-1 font-mono"
          >
            {k}={v}
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={true}
      >
        Collapse
      </button>
    </div>
  );
}
