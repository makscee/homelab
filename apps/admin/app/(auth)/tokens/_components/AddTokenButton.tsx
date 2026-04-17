"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = { disabled?: boolean };

/**
 * Primary CTA for the /tokens index. In Plan 13-04 this is a scaffolded
 * placeholder — the onClick fires a browser alert so the visual verification
 * checkpoint can confirm wiring. Plan 13-05 replaces the handler with a real
 * shadcn Dialog trigger (useState + AddTokenDialog).
 *
 * Degraded-mode contract (D-13-10): when `disabled`, the button is
 * aria-disabled + cursor-not-allowed and the click is a no-op.
 */
export function AddTokenButton({ disabled }: Props) {
  return (
    <Button
      disabled={disabled}
      aria-disabled={disabled ? "true" : undefined}
      className={disabled ? "cursor-not-allowed" : undefined}
      onClick={() => {
        if (disabled) return;
        alert("Add-token dialog — Plan 13-05");
      }}
    >
      <Plus className="mr-2 h-4 w-4" />
      Add token
    </Button>
  );
}
