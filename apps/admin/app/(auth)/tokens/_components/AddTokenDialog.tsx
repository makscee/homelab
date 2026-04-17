"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

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
  FormDescription,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

import { AddTokenSchema } from "../_lib/schemas";
import { apiAddToken } from "../_lib/api-client";

type Props = { open: boolean; onOpenChange: (v: boolean) => void };

export function AddTokenDialog({ open, onOpenChange }: Props) {
  const router = useRouter();
  const [reveal, setReveal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm({
    resolver: zodResolver(AddTokenSchema),
    defaultValues: {
      value: "",
      label: "",
      owner_host: "",
      tier: "pro" as const,
      notes: "",
    },
  });

  async function onSubmit(values: {
    value: string;
    label: string;
    owner_host: string;
    tier: "pro" | "max" | "enterprise";
    notes?: string;
  }) {
    setSubmitting(true);
    try {
      await apiAddToken(values);
      toast.success("Token added. Gauges appear after the next poll.");
      form.reset();
      onOpenChange(false);
      router.refresh();
    } catch (e: unknown) {
      const err = e as { message?: string; status?: number };
      if (err.message?.includes("invalid token format")) {
        toast.error("Token format invalid. Expected sk-ant-oat01-...");
      } else if (err.message?.includes("duplicate label")) {
        toast.error("A token with that label already exists.");
      } else {
        toast.error("Couldn't write to SOPS. Check the admin service logs.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Claude token</DialogTitle>
          <DialogDescription>
            Paste an <code>sk-ant-oat01-*</code> token. The value is encrypted
            with SOPS and never written to logs.
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
                  <FormLabel>Token value</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input
                        type={reveal ? "text" : "password"}
                        placeholder="sk-ant-oat01-..."
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setReveal((r) => !r)}
                      aria-label={reveal ? "Hide token" : "Reveal token"}
                    >
                      {reveal ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <FormDescription>
                    Format: sk-ant-oat01-[A-Za-z0-9_-]+
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Label</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. makscee-personal" {...field} />
                  </FormControl>
                  <FormDescription>
                    Shown in lists and metrics.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="owner_host"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Owner host</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormDescription>
                    Host that will use this token (from Ansible inventory).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tier</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="pro">Pro</SelectItem>
                      <SelectItem value="max">Max</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Free-form notes about this token"
                      maxLength={500}
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Up to 500 characters. Stored alongside the token in the
                    SOPS registry; never displayed outside the admin UI.
                  </FormDescription>
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
                Add token
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
