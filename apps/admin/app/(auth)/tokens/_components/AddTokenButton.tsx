"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AddTokenDialog } from "./AddTokenDialog";

type Props = { disabled?: boolean };

/**
 * Primary CTA on the /tokens index. Opens `AddTokenDialog` on click.
 *
 * Degraded-mode contract (D-13-10): when `disabled`, the button is
 * aria-disabled + cursor-not-allowed and does not open the dialog.
 */
export function AddTokenButton({ disabled }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        disabled={disabled}
        aria-disabled={disabled ? "true" : undefined}
        className={disabled ? "cursor-not-allowed" : undefined}
        onClick={() => {
          if (disabled) return;
          setOpen(true);
        }}
      >
        <Plus className="mr-2 h-4 w-4" />
        Add token
      </Button>
      <AddTokenDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
