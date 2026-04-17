import { getAuditDb } from "@/lib/audit-db.server";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AuditTable } from "./_components/AuditTable";
import { z } from "zod";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const BeforeSchema = z.string().regex(/^\d+$/).optional();

export type AuditRow = {
  id: number;
  created_at: string;
  user: string;
  action: string;
  target: string | null;
  payload_json: string | null;
  ip: string | null;
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const params = await searchParams;
  const parsed = BeforeSchema.safeParse(params.before);
  const before = parsed.success && parsed.data ? Number(parsed.data) : null;

  const db = getAuditDb();
  const stmt = db.prepare(
    `SELECT id, created_at, user, action, target, payload_json, ip
       FROM audit_log
      WHERE ($before IS NULL OR id < $before)
      ORDER BY id DESC
      LIMIT ${PAGE_SIZE}`,
  );
  const rows = stmt.all({ $before: before }) as AuditRow[];

  return (
    <div className="p-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Every administrative mutation, newest first. Filters and search are
          coming in a later phase.
        </p>
      </header>
      <AuditTable rows={rows} before={before} pageSize={PAGE_SIZE} />
    </div>
  );
}
