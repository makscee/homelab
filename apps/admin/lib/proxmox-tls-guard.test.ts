import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const SCAN_DIRS = ["apps/admin", "ansible"];
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  ".turbo",
  "coverage",
]);
const SKIP_EXT = new Set([".lock", ".lockb", ".log", ".png", ".jpg", ".ico"]);
const FORBIDDEN = "NODE_TLS_REJECT_UNAUTHORIZED";

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (st.isFile()) {
      const dot = entry.lastIndexOf(".");
      const ext = dot >= 0 ? entry.slice(dot) : "";
      if (SKIP_EXT.has(ext)) continue;
      yield full;
    }
  }
}

describe("PROXMOX-06: TLS verify bypass guard", () => {
  test(`no ${FORBIDDEN} references in apps/admin or ansible`, () => {
    const hits: string[] = [];
    const selfPath = __filename;
    for (const rel of SCAN_DIRS) {
      const root = join(REPO_ROOT, rel);
      for (const file of walk(root)) {
        if (file === selfPath) continue;
        let content: string;
        try {
          content = readFileSync(file, "utf8");
        } catch {
          continue;
        }
        if (content.includes(FORBIDDEN)) hits.push(file);
      }
    }
    expect(hits).toEqual([]);
  });
});
