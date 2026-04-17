# SEC-05 — Input Validation + DB Query Safety Policy

**Scope:** apps/admin
**Enforced from:** Phase 12 (forward policy — no runtime queries yet; Phase 14 ships first DB user)
**Owner:** operator (reviews in PR)

## Policy

### Input validation (Zod 3.24.x)

Every Route Handler under `apps/admin/app/api/**/route.ts` MUST validate inputs before the handler's first side-effect:

```ts
import { z } from "zod";

const BodySchema = z.object({
  tokenLabel: z.string().min(1).max(64),
  enabled: z.boolean(),
});

export async function POST(req: Request) {
  const body = BodySchema.parse(await req.json());
  // ... handler logic uses body.tokenLabel, body.enabled
}
```

- `parse()` throws on invalid input; top-level handler wraps in try/catch returning HTTP 400
- NEVER `as unknown as T`, NEVER skip parse() for "trusted" clients (defense in depth)
- Query params + headers ALSO validated: `z.string().parse(req.headers.get("x-foo"))`

### Database queries (Drizzle prepared statements)

Once Phase 14 introduces the DB layer:

- EVERY query MUST use Drizzle's `.prepare()` API OR Drizzle's query builder (both parameterized)
- ZERO raw SQL. ZERO string concatenation into `` sql`...` ``.
- Example:
  ```ts
  const getAuditByUser = db.select().from(auditLog).where(eq(auditLog.user, sql.placeholder("user"))).prepare("getAuditByUser");
  // Use: getAuditByUser.execute({ user: "makscee" })
  ```

### Lint enforcement

- `eslint-plugin-server-only` (SEC-04) catches server/client boundary crossings at lint time
- A future lint rule (Phase 19 hardening) flags handler files without a top-level Zod parse — manual PR review is the current enforcement

## Pitfalls referenced

- P-18 — Zod validation on server actions
- P-03 — RSC secret leak (server-only gate)
