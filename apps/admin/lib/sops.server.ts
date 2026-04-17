import "server-only";

import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";

// --------------------------------------------------------------------------
// Schema + Types (D-13-13)
// --------------------------------------------------------------------------

export const TokenEntrySchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1),
  // Accept real token shape OR test-fixture shape. We intentionally do NOT
  // include the exact shape of a real token in error messages or logs.
  value: z.string().regex(/^sk-ant-oat01-[A-Za-z0-9_-]+$/),
  tier: z.enum(["pro", "max", "enterprise"]),
  owner_host: z.string().min(1),
  enabled: z.boolean(),
  added_at: z.string().datetime({ offset: true }).or(z.string().datetime()),
  rotated_at: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
  deleted_at: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
  notes: z.string().optional(),
});

export const TokenRegistrySchema = z.object({
  tokens: z.array(TokenEntrySchema),
});

export type TokenEntry = z.infer<typeof TokenEntrySchema>;
export type TokenRegistry = z.infer<typeof TokenRegistrySchema>;

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

const DEFAULT_REGISTRY_PATH =
  process.env.CLAUDE_TOKENS_SOPS_PATH ??
  "secrets/claude-tokens.sops.yaml";
const SOPS_BIN = process.env.SOPS_BIN ?? "sops";

// Read age recipients dynamically — tests set this per-invocation. If unset,
// sops falls back to the repo-wide .sops.yaml creation_rules.
function getAgeRecipients(): string {
  return process.env.SOPS_AGE_RECIPIENTS ?? "";
}

// --------------------------------------------------------------------------
// spawnSync injection for tests (DI)
// --------------------------------------------------------------------------

type SpawnSyncFn = typeof childProcess.spawnSync;

let spawnSyncImpl: SpawnSyncFn | null = null;

/**
 * Test-only: override the spawnSync implementation used by this module.
 * Pass `null` to restore the real `node:child_process` spawnSync.
 * Name starts with underscore to signal internal/test use.
 */
export function _setSpawnSyncForTest(fn: SpawnSyncFn | null): void {
  spawnSyncImpl = fn;
}

function spawn(
  cmd: string,
  args: readonly string[],
  opts?: childProcess.SpawnSyncOptionsWithBufferEncoding,
): childProcess.SpawnSyncReturns<Buffer> {
  const fn = spawnSyncImpl ?? childProcess.spawnSync;
  return fn(cmd, args as string[], opts ?? {}) as childProcess.SpawnSyncReturns<Buffer>;
}

// --------------------------------------------------------------------------
// Error classes — messages NEVER include decrypted registry content.
// Any token-shaped substring is redacted before the message is composed.
// --------------------------------------------------------------------------

const TOKEN_PATTERN = /sk-ant-oat01-[A-Za-z0-9_-]+/g;

function redact(text: string): string {
  return text.replace(TOKEN_PATTERN, "[REDACTED_TOKEN]");
}

export class SopsUnavailableError extends Error {
  constructor(message = "sops binary unavailable") {
    super(redact(message));
    this.name = "SopsUnavailableError";
  }
  toString(): string {
    return `${this.name}: ${redact(this.message)}`;
  }
}

export class SopsDecryptError extends Error {
  readonly targetPath: string;
  constructor(targetPath: string, stderr: string) {
    const sanitized = redact(stderr).slice(0, 500);
    super(`sops decrypt failed for ${targetPath}: ${sanitized}`);
    this.name = "SopsDecryptError";
    this.targetPath = targetPath;
  }
  toString(): string {
    return `${this.name}: ${redact(this.message)}`;
  }
}

export class SopsWriteError extends Error {
  readonly targetPath: string;
  constructor(targetPath: string, stderr: string) {
    const sanitized = redact(stderr).slice(0, 500);
    super(`sops write failed for ${targetPath}: ${sanitized}`);
    this.name = "SopsWriteError";
    this.targetPath = targetPath;
  }
  toString(): string {
    return `${this.name}: ${redact(this.message)}`;
  }
}

// --------------------------------------------------------------------------
// Async mutex — serialize mutation calls within a single process.
// --------------------------------------------------------------------------

let mutexTail: Promise<unknown> = Promise.resolve();

async function withMutex<T>(fn: () => Promise<T>): Promise<T> {
  const previous = mutexTail;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  // New tail waits for THIS work to finish, not just the previous.
  mutexTail = previous.then(() => gate);
  try {
    await previous;
    return await fn();
  } finally {
    release();
  }
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

export function sopsAvailable(): boolean {
  try {
    const res = spawn(SOPS_BIN, ["--version"], { stdio: "pipe" });
    return res.status === 0;
  } catch {
    return false;
  }
}

export async function decryptRegistry(
  registryPath: string = DEFAULT_REGISTRY_PATH,
): Promise<TokenRegistry> {
  const res = spawn(
    SOPS_BIN,
    ["-d", "--output-type", "json", registryPath],
    { stdio: "pipe" },
  );
  if (res.status !== 0) {
    const stderr = (res.stderr ?? Buffer.from("")).toString("utf-8");
    throw new SopsDecryptError(registryPath, stderr);
  }
  let parsed: unknown;
  try {
    const stdout = (res.stdout ?? Buffer.from("")).toString("utf-8");
    parsed = JSON.parse(stdout);
  } catch (e) {
    // Never forward the raw JSON text — it contains decrypted tokens.
    throw new SopsDecryptError(registryPath, "invalid JSON output from sops");
  }
  try {
    return TokenRegistrySchema.parse(parsed);
  } catch (e) {
    // Zod error could contain decrypted values — strip them.
    throw new SopsDecryptError(
      registryPath,
      "schema validation failed on decrypted registry",
    );
  }
}

/**
 * Set a single field in the SOPS-encrypted registry.
 * Serialized through in-process mutex (T-13-01-02).
 *
 * @param registryPath path to the .sops.yaml file
 * @param jsonPath SOPS --set path expression, e.g. `["tokens"][0]["enabled"]`
 * @param value JSON-encoded new value (quotes already applied by caller
 *              for strings; booleans/numbers must be bare).
 */
export function setRegistryField(
  registryPath: string,
  jsonPath: string,
  value: string,
): Promise<void> {
  return withMutex(async () => {
    // Guard against shell metacharacters / command injection (T-13-01-04).
    // argv-style spawn avoids the shell, but we still reject suspicious input.
    if (!/^(\[[^\[\]]+\])+$/.test(jsonPath)) {
      throw new SopsWriteError(
        registryPath,
        "invalid jsonPath shape; expected repeated [key] segments",
      );
    }
    const setArg = `${jsonPath} ${value}`;
    const res = spawn(
      SOPS_BIN,
      ["--set", setArg, registryPath],
      { stdio: "pipe" },
    );
    if (res.status !== 0) {
      const stderr = (res.stderr ?? Buffer.from("")).toString("utf-8");
      throw new SopsWriteError(registryPath, stderr);
    }
  });
}

/**
 * Replace the entire registry with `next`, using a tmp-file + atomic rename.
 * Serialized through in-process mutex. Validates `next` against Zod before
 * writing anything.
 */
export function replaceRegistry(
  registryPath: string,
  next: TokenRegistry,
): Promise<void> {
  return withMutex(async () => {
    // Validate up-front so invalid input cannot leak to disk.
    TokenRegistrySchema.parse(next);

    const tmpPath = `${registryPath}.tmp`;
    // Ensure containing directory exists.
    const dir = path.dirname(registryPath);
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // best-effort
    }

    try {
      // Write plaintext JSON at 0o600 — temp on-disk window is the only time
      // plaintext hits persistent storage (T-13-01-05 accepted residual).
      fs.writeFileSync(tmpPath, JSON.stringify(next), { mode: 0o600 });

      // Encrypt in-place. `--input-type json --output-type yaml` forces a
      // YAML .sops.yaml result even though the tmp file has .tmp extension.
      const encryptArgs = [
        "-e", "-i",
        "--input-type", "json",
        "--output-type", "yaml",
      ];
      const recipients = getAgeRecipients();
      if (recipients) {
        // When recipients are passed explicitly, also bypass .sops.yaml
        // creation_rules (sops errors if a config is found but no rule
        // matches the path, even when --age is set).
        encryptArgs.push("--config", "/dev/null", "--age", recipients);
      }
      encryptArgs.push(tmpPath);
      const res = spawn(SOPS_BIN, encryptArgs, { stdio: "pipe" });
      if (res.status !== 0) {
        const stderr = (res.stderr ?? Buffer.from("")).toString("utf-8");
        throw new SopsWriteError(registryPath, stderr);
      }
      // Atomic rename (same-filesystem).
      fs.renameSync(tmpPath, registryPath);
    } catch (e) {
      // Best-effort cleanup — never leave plaintext tmp behind.
      try { fs.rmSync(tmpPath, { force: true }); } catch {}
      throw e;
    }
  });
}
