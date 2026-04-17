"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { RenameTokenSchema } from "../_lib/schemas";
import { apiRenameToken } from "../_lib/api-client";

type Props = {
  id: string;
  currentLabel: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export function RenameTokenDialog({
  id,
  currentLabel,
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const form = useForm({
    resolver: zodResolver(RenameTokenSchema),
    defaultValues: { label: currentLabel },
    values: { label: currentLabel },
  });

  async function onSubmit(values: { label: string }) {
    if (values.label === currentLabel) {
      onOpenChange(false);
      return;
    }
    setSubmitting(true);
    try {
      await apiRenameToken(id, values.label);
      toast.success(`Token renamed to "${values.label}".`);
      form.reset({ label: values.label });
      onOpenChange(false);
      router.refresh();
    } catch (e: unknown) {
      const err = e as { message?: string };
      if (err.message?.includes("duplicate label")) {
        toast.error("A token with that label already exists.");
      } else {
        toast.error("Rename failed. Label not changed.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename token</DialogTitle>
          <DialogDescription>
            Rename &ldquo;{currentLabel}&rdquo;. Metric labels update on the
            next exporter poll.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Label</FormLabel>
                  <FormControl>
                    <Input autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
