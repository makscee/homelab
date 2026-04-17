import "server-only";
import { Database } from "bun:sqlite";

let _db: Database | null = null;

export function getAuditDb(): Database {
  if (_db) return _db;
  const dbPath = process.env.AUDIT_DB_PATH ?? "/var/lib/homelab-admin/audit.db";
  const db = new Database(dbPath, { create: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");
  db.run("PRAGMA foreign_keys = ON");
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY,
      created_at TEXT NOT NULL,
      user TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      payload_json TEXT,
      ip TEXT
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user);`);
  _db = db;
  return db;
}

// Test-only hook to reset singleton
export function __resetAuditDbForTests(): void {
  if (process.env.NODE_ENV !== "test") throw new Error("test-only");
  if (_db) _db.close();
  _db = null;
}
