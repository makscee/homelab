---
phase: 13
plan: 05
type: execute
wave: 4
depends_on: [13-03, 13-04]
files_modified:
  - apps/admin/app/(auth)/tokens/_components/RowActions.tsx
  - apps/admin/app/(auth)/tokens/_components/AddTokenDialog.tsx
  - apps/admin/app/(auth)/tokens/_components/RotateTokenDialog.tsx
  - apps/admin/app/(auth)/tokens/_components/RenameTokenDialog.tsx
  - apps/admin/app/(auth)/tokens/_components/DeleteTokenDialog.tsx
  - apps/admin/app/(auth)/tokens/_components/AddTokenButton.tsx
  - apps/admin/app/(auth)/tokens/_components/TokensTable.tsx
  - apps/admin/app/(auth)/tokens/_lib/api-client.ts
  - apps/admin/app/(auth)/tokens/_lib/schemas.ts
  - apps/admin/app/(auth)/tokens/[id]/page.tsx
  - apps/admin/app/(auth)/tokens/[id]/_components/DetailChart.tsx
  - apps/admin/app/(auth)/layout.tsx
  - apps/admin/lib/csrf-cookie.server.ts
autonomous: false
requirements:
  - TOKEN-03
  - TOKEN-04
  - TOKEN-05
  - TOKEN-06
user_setup: []
tags:
  - ui
  - mutations
  - detail-page
  - forms

must_haves:
  truths:
    - "Operator clicks Add token → dialog opens → submits sk-ant-oat01-* value → row appears on router.refresh()"
    - "Operator clicks kebab → Rotate → enters new value → atomic swap; toast confirms"
    - "Operator clicks kebab → Disable → one-click toggle; toast confirms; state badge flips to Disabled"
    - "Operator clicks kebab → Rename → dialog pre-fills label → submits new label"
    - "Operator clicks kebab → Delete → AlertDialog requires typed-label match → soft-delete succeeds"
    - "Token detail page /tokens/[id] renders 7-day Recharts chart with 80% + 95% threshold reference lines"
    - "Every mutation request carries x-csrf-token header matching the hla-csrf cookie"
    - "Failed CSRF/AuthN returns 403/401 without leaking internals"
  artifacts:
    - path: "apps/admin/app/(auth)/tokens/_components/AddTokenDialog.tsx"
      provides: "shadcn Dialog + Form + react-hook-form + Zod schema for add"
    - path: "apps/admin/app/(auth)/tokens/_components/RotateTokenDialog.tsx"
      provides: "Single-field rotate dialog with destructive confirm"
    - path: "apps/admin/app/(auth)/tokens/_components/RenameTokenDialog.tsx"
      provides: "Inline rename dialog"
    - path: "apps/admin/app/(auth)/tokens/_components/DeleteTokenDialog.tsx"
      provides: "AlertDialog with typed-label confirmation"
    - path: "apps/admin/app/(auth)/tokens/_components/RowActions.tsx"
      provides: "Kebab DropdownMenu client component orchestrating all 4 mutation dialogs"
    - path: "apps/admin/app/(auth)/tokens/[id]/page.tsx"
      provides: "Detail RSC: breadcrumb, metadata card, Recharts 7d chart"
    - path: "apps/admin/app/(auth)/tokens/[id]/_components/DetailChart.tsx"
      provides: "Client Recharts LineChart with 80%/95% reference lines"
    - path: "apps/admin/lib/csrf-cookie.server.ts"
      provides: "Issues csrf cookie on (auth) layout render"
      exports: ["issueCsrfCookieOnce"]
  key_links:
    - from: "dialog components"
      to: "apps/admin/app/(auth)/tokens/_lib/api-client.ts"
      via: "fetch with x-csrf-token header"
      pattern: "x-csrf-token"
    - from: "api-client.ts"
      to: "/api/tokens/*"
      via: "POST/DELETE fetch"
      pattern: "/api/tokens"
    - from: "(auth)/layout.tsx"
      to: "csrf-cookie.server.ts"
      via: "issueCsrfCookieOnce()"
      pattern: "issueCsrfCookieOnce"
    - from: "tokens/[id]/page.tsx"
      to: "prometheus.server.ts queryRange"
      via: "7-day chart data"
      pattern: "queryRange"
---

<objective>
Complete Phase 13: wire all 5 mutation flows (add, rotate, toggle, rename, delete) into the list page, ship the `/tokens/[id]` detail page with the full Recharts 7-day chart + threshold reference lines, and ensure every mutation request carries CSRF protection.

Purpose: This plan closes SC #2, #3, and #4 entirely. After this plan ships, operators manage tokens exclusively from the web UI.
Output: Functional mutation dialogs with exact UI-SPEC copy, detail page with chart, CSRF cookie issuance, end-to-end visual + behavioral verification.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/13-claude-tokens-page/13-CONTEXT.md
@.planning/phases/13-claude-tokens-page/13-UI-SPEC.md
@.planning/phases/13-claude-tokens-page/13-03-backend-libs-PLAN.md
@.planning/phases/13-claude-tokens-page/13-04-tokens-list-page-PLAN.md
@apps/admin/app/(auth)/layout.tsx
@apps/admin/lib/csrf.server.ts
@apps/admin/components.json

<interfaces>
<!-- API routes from Plan 13-03 -->
POST /api/tokens               { label, value, tier, owner_host, notes? }
DELETE /api/tokens/[id]        (no body)
POST /api/tokens/[id]/rotate   { value }
POST /api/tokens/[id]/toggle   { enabled: boolean }
POST /api/tokens/[id]/rename   { label }

All routes require:
- Cookie: authjs.session-token (or equivalent from Phase 12 Auth.js)
- Cookie: hla-csrf=<hex>
- Header: x-csrf-token: <same hex as cookie>
- Header: content-type: application/json
- Header: origin: https://homelab.makscee.ru (in prod)

Response shape on success:
  { ok: true, token: PublicTokenEntry }
Response shape on error:
  { error: string, issues?: ZodIssue[] }

<!-- Helper module csrf-cookie.server.ts -->
export function issueCsrfCookieOnce(): Promise<void>;
// Reads cookies via next/headers; if no hla-csrf cookie present, sets one

<!-- CSRF client mirror pattern -->
// In client components:
function getCsrfFromCookie(): string {
  return document.cookie.split('; ').find(c => c.startsWith('hla-csrf='))?.split('=')[1] ?? '';
}

<!-- Detail page Prometheus query -->
queryRange('claude_usage_7d_pct{label="<label>"}', 7daysAgo, now, 3600, { revalidateSec: 60 })
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: CSRF cookie issuance on (auth) layout render + api-client helper</name>
  <files>apps/admin/lib/csrf-cookie.server.ts, apps/admin/app/(auth)/layout.tsx, apps/admin/app/(auth)/tokens/_lib/api-client.ts, apps/admin/app/(auth)/tokens/_lib/schemas.ts</files>
  <read_first>
    - apps/admin/lib/csrf.server.ts (Plan 13-03 Task 4: generateCsrfToken, csrfCookie, verifyCsrf)
    - apps/admin/app/(auth)/layout.tsx (current shared layout; Phase 12 wiring)
    - .planning/phases/13-claude-tokens-page/13-UI-SPEC.md §Copywriting (error toasts)
  </read_first>
  <action>
    1. Create `apps/admin/lib/csrf-cookie.server.ts`:
       ```typescript
       import 'server-only';
       import { cookies } from 'next/headers';
       import { generateCsrfToken, CSRF_COOKIE_NAME } from './csrf.server';

       export async function issueCsrfCookieOnce(): Promise<void> {
         const jar = await cookies();
         if (jar.get(CSRF_COOKIE_NAME)) return;
         const token = generateCsrfToken();
         jar.set({
           name: CSRF_COOKIE_NAME,
           value: token,
           path: '/',
           sameSite: 'strict',
           secure: process.env.NODE_ENV === 'production',
           httpOnly: false,   // client JS must read to mirror into x-csrf-token header
           maxAge: 28800,     // 8h, matches session TTL
         });
       }
       ```

    2. Edit `apps/admin/app/(auth)/layout.tsx`. Add the `issueCsrfCookieOnce()` call in the layout's async server component body, BEFORE the render:
       ```typescript
       import { issueCsrfCookieOnce } from '@/lib/csrf-cookie.server';
       // ... existing imports ...

       export default async function AuthLayout({ children }) {
         await issueCsrfCookieOnce();
         // ... existing auth checks / redirects from Phase 12 ...
         return /* existing layout JSX */;
       }
       ```
       Read the current layout.tsx first and insert the call at the right place (after auth check, before JSX return). Do NOT remove any Phase 12 logic.

    3. Create `apps/admin/app/(auth)/tokens/_lib/schemas.ts` (shared client Zod schemas that mirror the server API route schemas from Plan 13-03 Task 5):
       ```typescript
       import { z } from 'zod';

       export const LabelSchema = z.string()
         .min(1, 'Label required')
         .max(64, 'Label too long (max 64)')
         .regex(/^[A-Za-z0-9._-]+$/, 'Only letters, digits, dot, underscore, hyphen');

       export const ValueSchema = z.string()
         .regex(/^sk-ant-oat01-[A-Za-z0-9_-]+$/, 'Token format invalid. Expected sk-ant-oat01-...');

       export const TierSchema = z.enum(['pro', 'max', 'enterprise']);

       export const OwnerHostSchema = z.string().min(1, 'Owner host required').max(64);

       export const AddTokenSchema = z.object({
         value: ValueSchema,
         label: LabelSchema,
         owner_host: OwnerHostSchema,
         tier: TierSchema,
         notes: z.string().max(500).optional(),  // matches server InputSchema in Plan 13-03 Task 5
       });

       export const RotateTokenSchema = z.object({ value: ValueSchema });
       export const RenameTokenSchema = z.object({ label: LabelSchema });
       ```

    4. Create `apps/admin/app/(auth)/tokens/_lib/api-client.ts`:
       ```typescript
       // Client-only — never import in a .server.ts file.
       // IMPORTANT: Imports from csrf.shared (neutral module), NOT csrf.server.
       // csrf.server has `import 'server-only'` which breaks client bundles.
       import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@/lib/csrf.shared';

       function getCsrf(): string {
         const match = document.cookie
           .split('; ')
           .find(c => c.startsWith(`${CSRF_COOKIE_NAME}=`));
         return match ? match.split('=')[1] : '';
       }

       async function send(input: RequestInfo, init: RequestInit): Promise<any> {
         const headers = new Headers(init.headers);
         headers.set('content-type', 'application/json');
         headers.set(CSRF_HEADER_NAME, getCsrf());
         const resp = await fetch(input, { ...init, headers, credentials: 'same-origin' });
         const body = await resp.json().catch(() => ({}));
         if (!resp.ok) {
           const msg = body?.error ?? `HTTP ${resp.status}`;
           const err = new Error(msg) as Error & { status?: number; issues?: unknown };
           err.status = resp.status;
           if (body?.issues) err.issues = body.issues;
           throw err;
         }
         return body;
       }

       export async function apiAddToken(input: {
         label: string; value: string; tier: string; owner_host: string; notes?: string;
       }) {
         return send('/api/tokens', { method: 'POST', body: JSON.stringify(input) });
       }
       export async function apiRotateToken(id: string, value: string) {
         return send(`/api/tokens/${id}/rotate`, { method: 'POST', body: JSON.stringify({ value }) });
       }
       export async function apiToggleEnabled(id: string, enabled: boolean) {
         return send(`/api/tokens/${id}/toggle`, { method: 'POST', body: JSON.stringify({ enabled }) });
       }
       export async function apiRenameToken(id: string, label: string) {
         return send(`/api/tokens/${id}/rename`, { method: 'POST', body: JSON.stringify({ label }) });
       }
       export async function apiDeleteToken(id: string) {
         return send(`/api/tokens/${id}`, { method: 'DELETE' });
       }
       ```
       NOTE: csrf.shared.ts is introduced in Plan 13-03 Task 4 as a neutral (no 'server-only') constants module. Plan 13-03 Task 4 csrf.server.ts re-exports the same constants, so server code keeps working. Client code MUST import from csrf.shared to avoid pulling a server-only module into the client bundle.

    5. Install sonner (if Plan 13-01 spike didn't already):
       ```bash
       cd apps/admin && bunx shadcn@latest add sonner
       ```
       Verify `apps/admin/components/ui/sonner.tsx` exists. Add `<Toaster />` to the `(auth)/layout.tsx` root if not already present (per UI-SPEC §Toasts).
  </action>
  <verify>
    <automated>cd apps/admin &amp;&amp; bun run build 2&gt;&amp;1 | tail -20 &amp;&amp; grep -q 'issueCsrfCookieOnce' apps/admin/lib/csrf-cookie.server.ts &amp;&amp; grep -q 'issueCsrfCookieOnce' 'apps/admin/app/(auth)/layout.tsx' &amp;&amp; grep -q 'x-csrf-token' apps/admin/lib/csrf.server.ts</automated>
  </verify>
  <acceptance_criteria>
    - grep `issueCsrfCookieOnce` in `apps/admin/lib/csrf-cookie.server.ts` returns at least 1 line (export)
    - grep `issueCsrfCookieOnce` in `apps/admin/app/(auth)/layout.tsx` returns 1 line (call)
    - grep `sameSite: 'strict'` in csrf-cookie.server.ts returns 1 line
    - grep `httpOnly: false` in csrf-cookie.server.ts returns 1 line (documented non-HttpOnly for double-submit)
    - api-client.ts exists; grep `apiAddToken` / `apiRotateToken` / `apiToggleEnabled` / `apiRenameToken` / `apiDeleteToken` — each returns 1 line
    - grep `CSRF_HEADER_NAME` in api-client.ts returns at least 1 line
    - grep `from '@/lib/csrf.shared'` in api-client.ts returns 1 line (imports from shared module, NOT csrf.server)
    - grep `from '@/lib/csrf.server'` in api-client.ts returns 0 lines (server-only module must not leak into client bundle)
    - schemas.ts exists; grep `AddTokenSchema` returns 1 line
    - grep `notes: z.string().max(500)` in schemas.ts returns 1 line (matches server AddTokenSchema)
    - `apps/admin/components/ui/sonner.tsx` exists
    - `cd apps/admin && bun run build` exits 0
  </acceptance_criteria>
  <done>CSRF cookie issued on (auth) layout; api-client sends header on every mutation; Zod schemas shared between client and server.</done>
</task>

<task type="auto">
  <name>Task 2: AddTokenDialog, RotateTokenDialog, RenameTokenDialog, DeleteTokenDialog</name>
  <files>apps/admin/app/(auth)/tokens/_components/AddTokenDialog.tsx, apps/admin/app/(auth)/tokens/_components/RotateTokenDialog.tsx, apps/admin/app/(auth)/tokens/_components/RenameTokenDialog.tsx, apps/admin/app/(auth)/tokens/_components/DeleteTokenDialog.tsx</files>
  <read_first>
    - apps/admin/app/(auth)/tokens/_lib/api-client.ts (Task 1 — exported API functions)
    - apps/admin/app/(auth)/tokens/_lib/schemas.ts (Task 1 — Zod schemas)
    - .planning/phases/13-claude-tokens-page/13-UI-SPEC.md §Add-token dialog §Row actions (all 4 sections; copy must match VERBATIM)
    - .planning/phases/13-claude-tokens-page/13-01-SPIKE-NOTES.md (zodResolver import path from Plan 13-01)
    - apps/admin/components/ui/form.tsx (shadcn Form wiring from Plan 13-01)
  </read_first>
  <action>
    Each dialog is a client component. They receive `open` + `onOpenChange` from the parent `RowActions.tsx` (Task 3) or `AddTokenButton.tsx` (Task 4).

    **AddTokenDialog.tsx** (UI-SPEC §Add-token dialog — copy VERBATIM):
    ```tsx
    'use client';
    import { useState } from 'react';
    import { useRouter } from 'next/navigation';
    import { useForm } from 'react-hook-form';
    import { zodResolver } from '@hookform/resolvers/zod';  // verify import path against Plan 13-01 SPIKE-NOTES
    import { toast } from 'sonner';
    import { Eye, EyeOff } from 'lucide-react';
    import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
    import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from '@/components/ui/form';
    import { Input } from '@/components/ui/input';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
    import { Textarea } from '@/components/ui/textarea';
    import { Button } from '@/components/ui/button';
    import { AddTokenSchema } from '../_lib/schemas';
    import { apiAddToken } from '../_lib/api-client';

    type Props = { open: boolean; onOpenChange: (v: boolean) => void };

    export function AddTokenDialog({ open, onOpenChange }: Props) {
      const router = useRouter();
      const [reveal, setReveal] = useState(false);
      const [submitting, setSubmitting] = useState(false);

      const form = useForm({
        resolver: zodResolver(AddTokenSchema),
        defaultValues: { value: '', label: '', owner_host: '', tier: 'pro' as const, notes: '' },
      });

      async function onSubmit(values: any) {
        setSubmitting(true);
        try {
          await apiAddToken(values);
          toast.success('Token added. Gauges appear after the next poll.');
          form.reset();
          onOpenChange(false);
          router.refresh();
        } catch (e: any) {
          if (e.message?.includes('invalid token format')) {
            toast.error('Token format invalid. Expected sk-ant-oat01-...');
          } else if (e.message?.includes('duplicate label')) {
            toast.error('A token with that label already exists.');
          } else if (e.status === 503) {
            toast.error("Couldn't write to SOPS. Check the admin service logs.");
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
                Paste an <code>sk-ant-oat01-*</code> token. The value is encrypted with SOPS and never written to logs.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="value" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Token value</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input type={reveal ? 'text' : 'password'} placeholder="sk-ant-oat01-..." {...field} />
                      </FormControl>
                      <Button type="button" variant="ghost" size="icon"
                              onClick={() => setReveal(r => !r)}
                              aria-label={reveal ? 'Hide token' : 'Reveal token'}>
                        {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <FormDescription>Format: sk-ant-oat01-[A-Za-z0-9_-]+</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="label" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Label</FormLabel>
                    <FormControl><Input placeholder="e.g. makscee-personal" {...field} /></FormControl>
                    <FormDescription>Shown in lists and metrics.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="owner_host" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Owner host</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormDescription>Host that will use this token (from Ansible inventory).</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="tier" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tier</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="pro">Pro</SelectItem>
                        <SelectItem value="max">Max</SelectItem>
                        <SelectItem value="enterprise">Enterprise</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="notes" render={({ field }) => (
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
                    <FormDescription>Up to 500 characters. Stored alongside the token in the SOPS registry; never displayed outside the admin UI.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                  <Button type="submit" disabled={submitting}>Add token</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      );
    }
    ```

    **RotateTokenDialog.tsx** (UI-SPEC §Row actions — rotate; confirm button destructive):
    ```tsx
    'use client';
    import { useState } from 'react';
    import { useRouter } from 'next/navigation';
    import { useForm } from 'react-hook-form';
    import { zodResolver } from '@hookform/resolvers/zod';
    import { toast } from 'sonner';
    import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
    import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
    import { Input } from '@/components/ui/input';
    import { Button } from '@/components/ui/button';
    import { RotateTokenSchema } from '../_lib/schemas';
    import { apiRotateToken } from '../_lib/api-client';

    type Props = { id: string; label: string; open: boolean; onOpenChange: (v: boolean) => void };

    export function RotateTokenDialog({ id, label, open, onOpenChange }: Props) {
      const router = useRouter();
      const [submitting, setSubmitting] = useState(false);
      const form = useForm({ resolver: zodResolver(RotateTokenSchema), defaultValues: { value: '' } });

      async function onSubmit(values: { value: string }) {
        setSubmitting(true);
        try {
          await apiRotateToken(id, values.value);
          toast.success('Token rotated. Exporter reloads within 60 seconds.');
          form.reset();
          onOpenChange(false);
          router.refresh();
        } catch {
          toast.error('Rotate failed. Token not changed.');
        } finally { setSubmitting(false); }
      }

      return (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rotate token</DialogTitle>
              <DialogDescription>
                Replace the value for &ldquo;{label}&rdquo;. The old value becomes unusable immediately. The exporter reloads within 60 seconds.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="value" render={({ field }) => (
                  <FormItem>
                    <FormLabel>New token value</FormLabel>
                    <FormControl><Input type="password" placeholder="sk-ant-oat01-..." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                  <Button type="submit" variant="destructive" disabled={submitting}>Rotate</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      );
    }
    ```

    **RenameTokenDialog.tsx** (UI-SPEC §Row actions — rename; current value pre-filled):
    ```tsx
    'use client';
    import { useState } from 'react';
    import { useRouter } from 'next/navigation';
    import { useForm } from 'react-hook-form';
    import { zodResolver } from '@hookform/resolvers/zod';
    import { toast } from 'sonner';
    import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
    import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
    import { Input } from '@/components/ui/input';
    import { Button } from '@/components/ui/button';
    import { RenameTokenSchema } from '../_lib/schemas';
    import { apiRenameToken } from '../_lib/api-client';

    type Props = {
      id: string;
      currentLabel: string;                 // pre-fills the form and used in dialog title
      open: boolean;
      onOpenChange: (v: boolean) => void;
    };

    export function RenameTokenDialog({ id, currentLabel, open, onOpenChange }: Props) {
      const router = useRouter();
      const [submitting, setSubmitting] = useState(false);
      const form = useForm({
        resolver: zodResolver(RenameTokenSchema),
        defaultValues: { label: currentLabel },
        values: { label: currentLabel },   // re-syncs pre-fill when parent passes a new currentLabel
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
        } catch (e: any) {
          if (e.message?.includes('duplicate label')) {
            toast.error('A token with that label already exists.');
          } else {
            toast.error('Rename failed. Label not changed.');
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
                Rename &ldquo;{currentLabel}&rdquo;. Metric labels update on the next exporter poll.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="label" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Label</FormLabel>
                    <FormControl><Input autoFocus {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                  <Button type="submit" disabled={submitting}>Save</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      );
    }
    ```

    NOTE on prop name: the prop is `currentLabel` (NOT `label`). This matches how `RowActions.tsx` (Task 3) instantiates the dialog: `<RenameTokenDialog id={id} currentLabel={label} open=... onOpenChange=... />`. The internal form field is also named `label` to match `RenameTokenSchema` and the server contract.

    **DeleteTokenDialog.tsx** (UI-SPEC §Row actions — delete; AlertDialog with typed-label confirm):
    ```tsx
    'use client';
    import { useState } from 'react';
    import { useRouter } from 'next/navigation';
    import { toast } from 'sonner';
    import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';
    import { apiDeleteToken } from '../_lib/api-client';

    type Props = { id: string; label: string; open: boolean; onOpenChange: (v: boolean) => void };

    export function DeleteTokenDialog({ id, label, open, onOpenChange }: Props) {
      const router = useRouter();
      const [typed, setTyped] = useState('');
      const [submitting, setSubmitting] = useState(false);
      const match = typed === label;

      async function onConfirm() {
        setSubmitting(true);
        try {
          await apiDeleteToken(id);
          toast.success(`Token "${label}" deleted.`);
          setTyped('');
          onOpenChange(false);
          router.refresh();
        } catch {
          toast.error(`Couldn't delete "${label}".`);
        } finally { setSubmitting(false); }
      }

      return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete &ldquo;{label}&rdquo;</AlertDialogTitle>
              <AlertDialogDescription>
                This marks the token deleted in the registry. The exporter stops polling it on the next reload. Type the label to confirm.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <Label>Type &ldquo;{label}&rdquo; to confirm</Label>
              <Input value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setTyped('')}>Cancel</AlertDialogCancel>
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
    ```

    Copy strings MUST match UI-SPEC VERBATIM including curly quotes (`&ldquo; &rdquo;`). Do not paraphrase.
  </action>
  <verify>
    <automated>cd apps/admin &amp;&amp; bun run build 2&gt;&amp;1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - Files exist: AddTokenDialog.tsx, RotateTokenDialog.tsx, RenameTokenDialog.tsx, DeleteTokenDialog.tsx
    - grep `'use client'` in each of the 4 files returns 1 line
    - grep `Add Claude token` in AddTokenDialog.tsx returns 1 line (exact UI-SPEC title)
    - grep `Paste an` in AddTokenDialog.tsx returns 1 line (description start)
    - grep `sk-ant-oat01-\.\.\.` in AddTokenDialog.tsx returns at least 1 line (placeholder)
    - grep `Token added. Gauges appear after the next poll.` in AddTokenDialog.tsx returns 1 line
    - grep `Token format invalid. Expected sk-ant-oat01-...` in AddTokenDialog.tsx returns 1 line
    - grep `A token with that label already exists.` in AddTokenDialog.tsx returns 1 line
    - grep `Rotate token` in RotateTokenDialog.tsx returns 1 line (title)
    - grep `exporter reloads within 60 seconds` in RotateTokenDialog.tsx returns 1 line (case-insensitive ok)
    - grep `variant="destructive"` in RotateTokenDialog.tsx returns 1 line (confirm button)
    - grep `Rename token` in RenameTokenDialog.tsx returns 1 line (dialog title)
    - grep `currentLabel` in RenameTokenDialog.tsx returns at least 2 lines (prop in type + used in JSX and defaultValues)
    - grep `currentLabel: string` in RenameTokenDialog.tsx returns 1 line (Props type declares the prop)
    - grep `apiRenameToken` in RenameTokenDialog.tsx returns 1 line (wired to api-client, no placeholder)
    - grep `Token renamed to` in RenameTokenDialog.tsx returns 1 line (UI-SPEC success toast)
    - grep `name="notes"` in AddTokenDialog.tsx returns 1 line (Notes FormField per D-13-13 + D-13-11)
    - grep `<Textarea` in AddTokenDialog.tsx returns 1 line (Notes renders a textarea, matches 500-char schema)
    - grep `maxLength=\{500\}` in AddTokenDialog.tsx returns 1 line (client max matches server AddTokenSchema.notes)
    - grep `Notes (optional)` in AddTokenDialog.tsx returns 1 line (form label copy)
    - grep `Type` + `to confirm` in DeleteTokenDialog.tsx returns at least 1 line
    - grep `disabled=\{!match` in DeleteTokenDialog.tsx returns 1 line (typed-label gate)
    - `cd apps/admin && bun run build` exits 0
    - No `sk-ant-oat01-` literal appears outside the Zod regex in schemas.ts and the placeholder strings
  </acceptance_criteria>
  <done>Four dialogs render with exact UI-SPEC copy, validate via shared Zod schemas, call api-client on submit, show sonner toasts.</done>
</task>

<task type="auto">
  <name>Task 3: RowActions kebab (client) wiring all 4 mutation dialogs + toggle one-click</name>
  <files>apps/admin/app/(auth)/tokens/_components/RowActions.tsx, apps/admin/app/(auth)/tokens/_components/AddTokenButton.tsx, apps/admin/app/(auth)/tokens/_components/TokensTable.tsx</files>
  <read_first>
    - apps/admin/app/(auth)/tokens/_components/TokensTable.tsx (current server-component table from Plan 13-04)
    - apps/admin/app/(auth)/tokens/_components/AddTokenButton.tsx (Plan 13-04 placeholder)
    - .planning/phases/13-claude-tokens-page/13-UI-SPEC.md §Interaction Contract — Table (kebab item order, destructive styling)
    - apps/admin/components/ui/dropdown-menu.tsx (shadcn API reference)
  </read_first>
  <action>
    1. Create `apps/admin/app/(auth)/tokens/_components/RowActions.tsx`:
       ```tsx
       'use client';
       import { useState } from 'react';
       import { useRouter } from 'next/navigation';
       import { toast } from 'sonner';
       import { MoreVertical } from 'lucide-react';
       import { Button } from '@/components/ui/button';
       import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
       import { RotateTokenDialog } from './RotateTokenDialog';
       import { RenameTokenDialog } from './RenameTokenDialog';
       import { DeleteTokenDialog } from './DeleteTokenDialog';
       import { apiToggleEnabled } from '../_lib/api-client';

       type Props = {
         id: string;
         label: string;
         enabled: boolean;
         disabled: boolean;  // degraded mode (sopsAvailable false)
       };

       export function RowActions({ id, label, enabled, disabled }: Props) {
         const router = useRouter();
         const [dialog, setDialog] = useState<null | 'rotate' | 'rename' | 'delete'>(null);

         async function onToggle() {
           try {
             await apiToggleEnabled(id, !enabled);
             toast.success(enabled
               ? 'Token disabled. Gauges stop on the next poll.'
               : 'Token enabled. Gauges resume on the next poll.');
             router.refresh();
           } catch {
             toast.error('Toggle failed.');
           }
         }

         return (
           <>
             <DropdownMenu>
               <DropdownMenuTrigger asChild>
                 <Button
                   variant="ghost" size="icon" aria-label="Row actions"
                   disabled={disabled}
                   aria-disabled={disabled ? 'true' : undefined}
                   className="h-8 w-8"
                 >
                   <MoreVertical className="h-4 w-4" />
                 </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end">
                 <DropdownMenuItem onClick={() => setDialog('rotate')}>Rotate</DropdownMenuItem>
                 <DropdownMenuItem onClick={onToggle}>{enabled ? 'Disable' : 'Enable'}</DropdownMenuItem>
                 <DropdownMenuItem onClick={() => setDialog('rename')}>Rename</DropdownMenuItem>
                 <DropdownMenuItem
                   onClick={() => setDialog('delete')}
                   className="text-destructive focus:text-destructive"
                 >
                   Delete
                 </DropdownMenuItem>
               </DropdownMenuContent>
             </DropdownMenu>
             <RotateTokenDialog id={id} label={label}
                                open={dialog === 'rotate'}
                                onOpenChange={v => !v && setDialog(null)} />
             <RenameTokenDialog id={id} currentLabel={label}
                                open={dialog === 'rename'}
                                onOpenChange={v => !v && setDialog(null)} />
             <DeleteTokenDialog id={id} label={label}
                                open={dialog === 'delete'}
                                onOpenChange={v => !v && setDialog(null)} />
           </>
         );
       }
       ```

    2. Update `AddTokenButton.tsx` (replace Plan 13-04 placeholder):
       ```tsx
       'use client';
       import { useState } from 'react';
       import { Button } from '@/components/ui/button';
       import { Plus } from 'lucide-react';
       import { AddTokenDialog } from './AddTokenDialog';

       type Props = { disabled?: boolean };
       export function AddTokenButton({ disabled }: Props) {
         const [open, setOpen] = useState(false);
         return (
           <>
             <Button
               disabled={disabled}
               aria-disabled={disabled ? 'true' : undefined}
               className={disabled ? 'cursor-not-allowed' : undefined}
               onClick={() => !disabled && setOpen(true)}
             >
               <Plus className="mr-2 h-4 w-4" />
               Add token
             </Button>
             <AddTokenDialog open={open} onOpenChange={setOpen} />
           </>
         );
       }
       ```

    3. Update `TokensTable.tsx` to render `<RowActions />` in place of the disabled kebab button from Plan 13-04. Because `RowActions` is client, passing it props from the server `TokensTable` is fine (RSC → client boundary).

       In the TokensTable map, replace the inline `<Button aria-label="Row actions">...` with:
       ```tsx
       <TableCell>
         <RowActions
           id={row.entry.id}
           label={row.entry.label}
           enabled={row.entry.enabled}
           disabled={!writeAvailable}
         />
       </TableCell>
       ```
       Add `import { RowActions } from './RowActions';` at the top.
  </action>
  <verify>
    <automated>cd apps/admin &amp;&amp; bun run build 2&gt;&amp;1 | tail -15 &amp;&amp; grep -q 'RowActions' 'apps/admin/app/(auth)/tokens/_components/TokensTable.tsx'</automated>
  </verify>
  <acceptance_criteria>
    - RowActions.tsx exists; first line `'use client';`
    - grep `Rotate`, `Disable`, `Enable`, `Rename`, `Delete` (in-order) in RowActions.tsx each return 1 line
    - grep `text-destructive` in RowActions.tsx returns at least 1 line (Delete styling)
    - grep `Token disabled. Gauges stop on the next poll.` in RowActions.tsx returns 1 line (exact UI-SPEC copy)
    - grep `Token enabled. Gauges resume on the next poll.` in RowActions.tsx returns 1 line
    - AddTokenButton.tsx: grep `AddTokenDialog` returns 1 line (now wired)
    - AddTokenButton.tsx: no `alert(` remains (Plan 13-04 placeholder removed)
    - TokensTable.tsx: grep `<RowActions` returns 1 line
    - TokensTable.tsx: kebab Button with placeholder disabled logic REPLACED by RowActions
    - `cd apps/admin && bun run build` exits 0
  </acceptance_criteria>
  <done>Kebab dropdown wired: rotate/rename/delete open their dialogs; disable/enable is one-click with toasts; AddTokenButton opens AddTokenDialog.</done>
</task>

<task type="auto">
  <name>Task 4: Token detail page /tokens/[id] with Recharts 7-day chart</name>
  <files>apps/admin/app/(auth)/tokens/[id]/page.tsx, apps/admin/app/(auth)/tokens/[id]/_components/DetailChart.tsx</files>
  <read_first>
    - apps/admin/lib/token-registry.server.ts (listTokens; also consider adding getTokenById(id) helper if missing)
    - apps/admin/lib/prometheus.server.ts (queryRange)
    - .planning/phases/13-claude-tokens-page/13-UI-SPEC.md §Detail page (breadcrumb, metadata card, chart colors, thresholds)
  </read_first>
  <action>
    1. If `getTokenById(id)` does not yet exist in `apps/admin/lib/token-registry.server.ts`, add it now:
       ```typescript
       export async function getTokenById(id: string): Promise<PublicTokenEntry | null> {
         const reg = await decryptRegistry();
         const e = reg.tokens.find(t => t.id === id && !t.deleted_at);
         return e ? toPublic(e) : null;
       }
       ```

    2. Create `apps/admin/app/(auth)/tokens/[id]/_components/DetailChart.tsx`:
       ```tsx
       'use client';
       import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

       type Props = { samples: Array<[number, number]> };

       export function DetailChart({ samples }: Props) {
         if (samples.length === 0) {
           return (
             <div className="h-80 flex items-center justify-center rounded border bg-muted/30 text-sm text-muted-foreground">
               No range data yet. Check exporter health.
             </div>
           );
         }
         const data = samples.map(([t, v]) => ({
           t: new Date(t * 1000).toISOString(),
           v,
         }));
         return (
           <div className="h-80">
             <ResponsiveContainer width="100%" height="100%">
               <LineChart data={data} margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
                 <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                 <XAxis dataKey="t" tickFormatter={t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        stroke="hsl(var(--muted-foreground))" fontSize={12} />
                 <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`}
                        stroke="hsl(var(--muted-foreground))" fontSize={12} />
                 <Tooltip
                   formatter={(v: number) => [`${v.toFixed(1)}%`, '7d usage']}
                   labelFormatter={(t: string) => new Date(t).toLocaleString()}
                   contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', fontSize: '12px' }}
                 />
                 <ReferenceLine y={80} stroke="hsl(38 92% 50%)" strokeDasharray="4 4" />
                 <ReferenceLine y={95} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
                 <Line type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={2}
                       fill="hsl(var(--primary))" fillOpacity={0.1} dot={false} isAnimationActive={false} />
               </LineChart>
             </ResponsiveContainer>
           </div>
         );
       }
       ```

    3. Create `apps/admin/app/(auth)/tokens/[id]/page.tsx`:
       ```tsx
       import Link from 'next/link';
       import { notFound } from 'next/navigation';
       import { ChevronRight } from 'lucide-react';
       import { getTokenById } from '@/lib/token-registry.server';
       import { queryRange } from '@/lib/prometheus.server';
       import { Badge } from '@/components/ui/badge';
       import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
       import { DetailChart } from './_components/DetailChart';
       import { RowActions } from '../_components/RowActions';
       import { sopsAvailable } from '@/lib/sops.server';

       export const dynamic = 'force-dynamic';

       type Params = { params: Promise<{ id: string }> };

       export default async function TokenDetailPage({ params }: Params) {
         const { id } = await params;
         const entry = await getTokenById(id);
         if (!entry) notFound();

         const writeAvailable = sopsAvailable();
         const now = new Date();
         const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
         const promql = `claude_usage_7d_pct{label="${entry.label.replace(/"/g, '\\"')}"}`;
         const series = await queryRange(promql, sevenDaysAgo, now, 3600, { revalidateSec: 60 }).catch(() => []);
         const samples = series[0]?.samples ?? [];

         return (
           <div className="p-8">
             <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-sm text-muted-foreground">
               <Link href="/tokens" className="hover:underline">Tokens</Link>
               <ChevronRight className="h-4 w-4" />
               <span className="text-foreground">{entry.label}</span>
             </nav>

             <div className="flex items-start justify-between mb-8">
               <div className="flex items-center gap-4">
                 <h1 className="text-3xl font-semibold">{entry.label}</h1>
                 <Badge variant="secondary">{entry.tier}</Badge>
                 <span className="text-sm text-muted-foreground">{entry.owner_host}</span>
                 {entry.enabled
                   ? <Badge variant="secondary">Enabled</Badge>
                   : <Badge variant="outline">Disabled</Badge>}
               </div>
               <RowActions id={entry.id} label={entry.label} enabled={entry.enabled} disabled={!writeAvailable} />
             </div>

             <Card className="mb-8">
               <CardHeader><CardTitle className="text-base">7-day usage</CardTitle></CardHeader>
               <CardContent><DetailChart samples={samples} /></CardContent>
             </Card>

             <Card>
               <CardHeader><CardTitle className="text-base">Metadata</CardTitle></CardHeader>
               <CardContent className="grid grid-cols-2 gap-4 text-sm">
                 <div>
                   <div className="text-muted-foreground text-xs uppercase">ID</div>
                   <div className="font-mono text-xs">{entry.id}</div>
                 </div>
                 <div>
                   <div className="text-muted-foreground text-xs uppercase">Added</div>
                   <div className="font-mono text-xs">{entry.added_at}</div>
                 </div>
                 {entry.rotated_at && (
                   <div>
                     <div className="text-muted-foreground text-xs uppercase">Rotated</div>
                     <div className="font-mono text-xs">{entry.rotated_at}</div>
                   </div>
                 )}
                 {entry.notes && (
                   <div className="col-span-2">
                     <div className="text-muted-foreground text-xs uppercase">Notes</div>
                     <div>{entry.notes}</div>
                   </div>
                 )}
               </CardContent>
             </Card>
           </div>
         );
       }
       ```

    Note the `params: Promise<...>` type — Next.js 15 made params async. Verify against the Phase 12 pattern.

    4. If `Card`/`CardHeader`/etc are not yet installed: `bunx shadcn@latest add card`.
  </action>
  <verify>
    <automated>cd apps/admin &amp;&amp; bun run build 2&gt;&amp;1 | tail -15 &amp;&amp; test -f 'apps/admin/app/(auth)/tokens/[id]/page.tsx' &amp;&amp; test -f 'apps/admin/app/(auth)/tokens/[id]/_components/DetailChart.tsx'</automated>
  </verify>
  <acceptance_criteria>
    - Files exist: `tokens/[id]/page.tsx`, `tokens/[id]/_components/DetailChart.tsx`
    - grep `getTokenById` in tokens/[id]/page.tsx returns 1 line
    - grep `queryRange` in tokens/[id]/page.tsx returns 1 line
    - grep `notFound()` in tokens/[id]/page.tsx returns 1 line
    - grep `Breadcrumb` in tokens/[id]/page.tsx returns 1 line
    - grep `<ReferenceLine y={80}` in DetailChart.tsx returns 1 line
    - grep `<ReferenceLine y={95}` in DetailChart.tsx returns 1 line
    - grep `No range data yet` in DetailChart.tsx returns 1 line (exact UI-SPEC copy)
    - grep `fontOpacity` / `fillOpacity={0.1}` in DetailChart.tsx returns 1 line (10% fill per UI-SPEC)
    - grep `export async function getTokenById` in apps/admin/lib/token-registry.server.ts returns 1 line
    - `cd apps/admin && bun run build` exits 0
  </acceptance_criteria>
  <done>Detail page renders breadcrumb + h1 + tier/owner/state badges + kebab + 7d Recharts chart with 80%/95% reference lines + metadata card.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 5: End-to-end operator verification against ROADMAP SC #2, #3, #4</name>
  <what-built>All mutations wired end-to-end. Add/rotate/rename/enable/disable/delete + detail page with chart.</what-built>
  <how-to-verify>
    After deploying the admin build to mcow:

    1. **Empty-start state:** Visit `/tokens`. Expected empty state per Plan 13-04.
    2. **Add token (SC #2):** Click `Add token`. Dialog opens. Paste a REAL `sk-ant-oat01-*` token you own (not a placeholder). Fill label `verify-e2e`, owner `cc-worker`, tier `Pro`. Click `Add token`.
       - Expected: Dialog closes; success toast `Token added. Gauges appear after the next poll.`; new row appears.
       - Verify: View-source `curl -s https://homelab.makscee.ru/tokens | grep -c sk-ant-oat01-` returns `0` — value never reflected.
       - Verify: `ssh root@mcow 'journalctl -u homelab-admin --since="2 minutes ago" | grep -c sk-ant-oat01-'` returns `0` — value never logged.
       - Wait up to 5 minutes. Reload. Expected: 5h + 7d bars and reset countdown show real values (not `—`).
    3. **Rotate (SC #3):** Click kebab on `verify-e2e`, choose `Rotate`. Enter a different real `sk-ant-oat01-*` value. Click `Rotate`.
       - Expected: Toast `Token rotated. Exporter reloads within 60 seconds.`
       - Verify: `ssh root@mcow 'ls -la /var/lib/claude-usage-exporter/claude-tokens.json'` — mtime should have advanced within ~30s.
       - Verify: `ssh root@mcow 'journalctl -u claude-usage-exporter --since="1 minute ago" | grep "registry reloaded"'` shows a reload line.
       - Verify audit: `ssh root@mcow 'journalctl -u homelab-admin --since="2 minutes ago" | grep token.rotate'` shows a single-line JSON event with `action=token.rotate`, `token_id=<uuid>`, and diff includes `value: {before: '[ROTATED]', after: '[ROTATED]'}` (NOT a real token value).
    4. **Disable + Enable (SC #3):** Click kebab, `Disable`. Toast `Token disabled. Gauges stop on the next poll.` State badge flips to `Disabled` without page reload.
       - Wait 5+ minutes. Verify `curl http://100.101.0.9:9101/metrics | grep 'label="verify-e2e"'` from docker-tower no longer returns 5h/7d gauges for this label.
       - Click kebab, `Enable`. Verify gauges return within 5 min.
    5. **Rename (SC #3):** Click kebab, `Rename`. Change label to `verify-e2e-2`. Save.
       - Toast `Token renamed to "verify-e2e-2".`. Row updates without full reload.
    6. **Detail page (SC #4):** Click the `verify-e2e-2` label (not the kebab). Navigate to `/tokens/[id]`.
       - Expected: Breadcrumb `Tokens > verify-e2e-2`; h1 with label; tier badge, owner host, enabled badge, kebab; Recharts 7-day chart with a visible line series; 80% + 95% dashed reference lines; metadata card with id/added/rotated timestamps.
       - Accept: if the token was just added, the chart area may show `No range data yet. Check exporter health.` — this is correct behavior.
    7. **Delete (SC #3):** Back to `/tokens`. Click kebab on `verify-e2e-2`, `Delete`. AlertDialog appears. Type `verify-e2e-2` exactly. Confirm button enables. Click `Delete token`.
       - Toast `Token "verify-e2e-2" deleted.` Row disappears.
       - Verify SOPS: `sops -d --output-type json secrets/claude-tokens.sops.yaml | jq '.tokens[] | select(.label=="verify-e2e-2")'` — shows the entry with `deleted_at` set (soft-delete per D-13-12).
    8. **CSRF defense check:** Open browser devtools, Network tab, replay a POST to `/api/tokens/<id>/toggle` but strip the `x-csrf-token` header. Expected: 403.
    9. **Audit log completeness (SC #3):** `ssh root@mcow 'journalctl -u homelab-admin --since="30 minutes ago" | grep -oE ''"action":"token\\.[a-z]+"'' | sort | uniq -c'` — expected at minimum 5 distinct actions: `token.add`, `token.rotate`, `token.toggle` (2+), `token.rename`, `token.delete`.
    10. **Visual polish check:** Confirm all UI-SPEC copy strings you saw during steps 2-7 match VERBATIM (including curly quotes on "verify-e2e").

    Paste findings + any anomalies into the resume message.
  </how-to-verify>
  <resume-signal>Type "approved" with observations, or describe failures (e.g. "step 8: CSRF-stripped POST returned 200 — auth bypass").</resume-signal>
  <acceptance_criteria>
    - Step 2: Token added; view-source grep for `sk-ant-oat01-` returns 0; journalctl grep returns 0
    - Step 2: After 5min, bars and countdown populate with real values
    - Step 3: Rotate toast fires; registry mtime advances; exporter logs `registry reloaded`; audit shows `token.rotate` with redacted value diff
    - Step 4: Disable stops polling; Enable resumes; toasts match UI-SPEC
    - Step 5: Rename updates label; toast matches UI-SPEC
    - Step 6: Detail page shows breadcrumb, all badges, kebab, chart with reference lines, metadata card
    - Step 7: Delete requires exact typed match; soft-delete confirmed via sops + jq
    - Step 8: CSRF-stripped POST returns 403
    - Step 9: All 5 distinct audit actions appear in journal
    - Step 10: Copy strings match UI-SPEC verbatim
  </acceptance_criteria>
  <done>SC #2, #3, #4 proven end-to-end. Phase 13 complete.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser → /api/tokens/* | Untrusted mutation requests with auth cookie + CSRF |
| client JS → api-client.ts | Reads non-HttpOnly csrf cookie and mirrors into header |
| detail page query param → Prometheus promql | `entry.label` is embedded in promql string |

## STRIDE Threat Register

| Threat ID | Category | Component | ASVS | Disposition | Mitigation Plan |
|-----------|----------|-----------|------|-------------|-----------------|
| T-13-05-01 | Tampering | CSRF on all 5 mutation routes | V13.4 | mitigate | Task 1 issues cookie; api-client.ts mirrors into x-csrf-token header; Plan 13-03 verifyCsrf on every route; Task 5 step 8 proves 403 when header stripped |
| T-13-05-02 | Information Disclosure | Token value echoed after submit | V7.1 | mitigate | API responses only include PublicTokenEntry (Plan 13-03); dialogs discard form state on close; reveal toggle is local state only |
| T-13-05-03 | Information Disclosure | CSRF cookie not HttpOnly | V13.4 | accept | Double-submit requires client JS read; httpOnly=false is intentional; SameSite=Strict + Secure + origin check defend against cross-site read |
| T-13-05-04 | Elevation of Privilege | Type-label confirm bypass on delete | V1.2 | mitigate | `disabled={!match \|\| submitting}` on AlertDialogAction; server soft-delete is irreversible only on exporter reload — operator-observable |
| T-13-05-05 | Injection | entry.label into PromQL string | V5.3 | mitigate | Task 4 escapes `"` with `replace(/"/g, '\\"')`; label already restricted to `[A-Za-z0-9._-]+` in Zod schema — no injection surface |
| T-13-05-06 | Repudiation | Mutation without audit trail | V7.1 | mitigate | Plan 13-03 Task 3 emits per mutation; Task 5 step 9 verifies 5 distinct actions logged |
| T-13-05-07 | Denial of Service | Toast spam if user rapid-clicks | V11.4 | mitigate | `setSubmitting(true)` disables submit button during in-flight request; max-stack of 3 from UI-SPEC prevents toast overflow |
| T-13-05-08 | Information Disclosure | Error toast leaks SOPS stderr | V7.1 | mitigate | Task 2 maps known errors to UI-SPEC-defined messages; unknown errors fall back to `Couldn't write to SOPS. Check the admin service logs.` |
| T-13-05-09 | Tampering | Sparkline/chart XSS via label | V5.3 | mitigate | React escapes by default; label string is only used in text content, never dangerouslySetInnerHTML |

All threats have a disposition. No high-severity unmitigated.
</threat_model>

<verification>
- `cd apps/admin && bun run build` exits 0
- Task 5 all 10 steps pass
- Audit log shows 5 distinct actions
- CSRF defense operational
- View-source + journalctl confirm no token value leakage
</verification>

<success_criteria>
Phase 13 complete. SC #1, #2, #3, #4 fully proven. SC #5 (exporter tech-debt) proven in Plan 13-02 Task 4. Operator can manage all Claude tokens from the web UI without ever editing SOPS files by hand.
</success_criteria>

<output>
After completion, create `.planning/phases/13-claude-tokens-page/13-05-SUMMARY.md` with: all 5 audit action JSON examples (redacted), screenshot of detail-page chart, UI-SPEC copy verification checklist, any deviation notes. Also create `.planning/phases/13-claude-tokens-page/13-VERIFICATION.md` rolling up all 5 SC proofs for the phase close-out.
</output>
