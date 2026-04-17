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

import { RotateTokenSchema } from "../_lib/schemas";
import { apiRotateToken } from "../_lib/api-client";

type Props = {
  id: string;
  label: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export function RotateTokenDialog({ id, label, open, onOpenChange }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const form = useForm({
    resolver: zodResolver(RotateTokenSchema),
    defaultValues: { value: "" },
  });

  async function onSubmit(values: { value: string }) {
    setSubmitting(true);
    try {
      await apiRotateToken(id, values.value);
      toast.success("Token rotated. Exporter reloads within 60 seconds.");
      form.reset();
      onOpenChange(false);
      router.refresh();
    } catch {
      toast.error("Rotate failed. Token not changed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rotate token</DialogTitle>
          <DialogDescription>
            Replace the value for &ldquo;{label}&rdquo;. The old value becomes
            unusable immediately. The exporter reloads within 60 seconds.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New token value</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="sk-ant-oat01-..."
                      autoComplete="off"
                      {...field}
                    />
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
              <Button
                type="submit"
                variant="destructive"
                disabled={submitting}
              >
                Rotate
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
