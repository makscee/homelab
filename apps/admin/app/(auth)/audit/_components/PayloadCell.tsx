"use client";
import { useState } from "react";

export function PayloadCell({ json }: { json: string | null }) {
  const [open, setOpen] = useState(false);

  if (json === null)
    return <span className="text-muted-foreground">—</span>;

  const preview = json.length > 80 ? json.slice(0, 80) + "…" : json;

  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className="text-left font-mono text-xs hover:text-foreground"
      aria-expanded={open}
    >
      {open ? (
        <pre className="whitespace-pre-wrap max-h-[200px] overflow-y-auto">
          {json}
        </pre>
      ) : (
        preview
      )}
    </button>
  );
}
