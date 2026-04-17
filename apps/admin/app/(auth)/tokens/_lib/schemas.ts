// Shared client-side Zod schemas. Mirror the server-side InputSchemas in
// `apps/admin/app/api/tokens/**/route.ts` — any drift is a client/server
// contract bug.
import { z } from "zod";

export const LabelSchema = z
  .string()
  .min(1, "Label required")
  .max(64, "Label too long (max 64)")
  .regex(/^[A-Za-z0-9._-]+$/, "Only letters, digits, dot, underscore, hyphen");

export const ValueSchema = z
  .string()
  .regex(
    /^sk-ant-oat01-[A-Za-z0-9_-]+$/,
    "Token format invalid. Expected sk-ant-oat01-...",
  );

export const TierSchema = z.enum(["pro", "max", "enterprise"]);

export const OwnerHostSchema = z
  .string()
  .min(1, "Owner host required")
  .max(64);

export const AddTokenSchema = z.object({
  value: ValueSchema,
  label: LabelSchema,
  owner_host: OwnerHostSchema,
  tier: TierSchema,
  notes: z.string().max(500).optional(),
});

export const RotateTokenSchema = z.object({ value: ValueSchema });
export const RenameTokenSchema = z.object({ label: LabelSchema });
