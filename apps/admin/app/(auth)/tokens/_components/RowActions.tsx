"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { RotateTokenDialog } from "./RotateTokenDialog";
import { RenameTokenDialog } from "./RenameTokenDialog";
import { DeleteTokenDialog } from "./DeleteTokenDialog";
import { apiToggleEnabled } from "../_lib/api-client";

type Props = {
  id: string;
  label: string;
  enabled: boolean;
  disabled: boolean; // degraded mode (sopsAvailable false)
};

type OpenDialog = null | "rotate" | "rename" | "delete";

/**
 * Kebab dropdown orchestrating all four row-level mutation flows.
 *
 * Items in UI-SPEC order: Rotate · Disable/Enable · Rename · Delete.
 * Disable/Enable is a one-click inline mutation — no confirmation dialog.
 * Delete is styled with destructive text color + carries the typed-label gate.
 */
export function RowActions({ id, label, enabled, disabled }: Props) {
  const router = useRouter();
  const [dialog, setDialog] = useState<OpenDialog>(null);

  async function onToggle() {
    try {
      await apiToggleEnabled(id, !enabled);
      toast.success(
        enabled
          ? "Token disabled. Gauges stop on the next poll."
          : "Token enabled. Gauges resume on the next poll.",
      );
      router.refresh();
    } catch {
      toast.error("Toggle failed.");
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Row actions"
            disabled={disabled}
            aria-disabled={disabled ? "true" : undefined}
            className="h-8 w-8"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDialog("rotate")}>
            Rotate
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onToggle}>
            {enabled ? "Disable" : "Enable"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog("rename")}>
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setDialog("delete")}
            className="text-destructive focus:text-destructive"
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RotateTokenDialog
        id={id}
        label={label}
        open={dialog === "rotate"}
        onOpenChange={(v) => !v && setDialog(null)}
      />
      <RenameTokenDialog
        id={id}
        currentLabel={label}
        open={dialog === "rename"}
        onOpenChange={(v) => !v && setDialog(null)}
      />
      <DeleteTokenDialog
        id={id}
        label={label}
        open={dialog === "delete"}
        onOpenChange={(v) => !v && setDialog(null)}
      />
    </>
  );
}
