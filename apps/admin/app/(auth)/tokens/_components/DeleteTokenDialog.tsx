"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { apiDeleteToken } from "../_lib/api-client";

type Props = {
  id: string;
  label: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export function DeleteTokenDialog({ id, label, open, onOpenChange }: Props) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const match = typed === label;

  async function onConfirm() {
    setSubmitting(true);
    try {
      await apiDeleteToken(id);
      toast.success(`Token "${label}" deleted.`);
      setTyped("");
      onOpenChange(false);
      router.refresh();
    } catch {
      toast.error(`Couldn't delete "${label}".`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{label}&rdquo;</AlertDialogTitle>
          <AlertDialogDescription>
            This marks the token deleted in the registry. The exporter stops
            polling it on the next reload. Type the label to confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label>Type &ldquo;{label}&rdquo; to confirm</Label>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setTyped("")}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={!match || submitting}
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete token
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
