import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as childProcess from "node:child_process";
import {
  sopsAvailable,
  decryptRegistry,
  setRegistryField,
  replaceRegistry,
  SopsDecryptError,
  SopsWriteError,
  _setSpawnSyncForTest,
  type TokenRegistry,
} from "./sops.server";

// Real spawnSync reference — captured before any test can mutate it.
const realSpawnSync = childProcess.spawnSync;

// Test fixtures directory (in repo, gitignored).
const FIXTURE_DIR = path.join(process.cwd(), "lib", "__fixtures__");
const FIXTURE_REGISTRY_SOPS = path.join(FIXTURE_DIR, "claude-tokens.test.sops.yaml");
const FIXTURE_REGISTRY_PLAIN = path.join(FIXTURE_DIR, "claude-tokens.test.plain.yaml");

/**
 * Create a SOPS-encrypted fixture using the repo's default .sops.yaml recipient.
 * This runs real sops so the fixture matches production encryption.
 */
function createEncryptedFixture(plaintextYaml: string, targetPath: string): void {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tmpPlain = `${targetPath}.tmp-plain.yaml`;
  fs.writeFileSync(tmpPlain, plaintextYaml);
  try {
    const res = realSpawnSync(
      "sops",
      ["-e", "--input-type", "yaml", "--output-type", "yaml", tmpPlain],
      { encoding: "utf-8" },
    );
    if (res.status !== 0) {
      throw new Error(`sops encrypt failed: ${res.stderr}`);
    }
    fs.writeFileSync(targetPath, res.stdout);
  } finally {
    try { fs.unlinkSync(tmpPlain); } catch {}
  }
}

beforeAll(() => {
  // Reset any test spawn override from previous test leakage.
  _setSpawnSyncForTest(null);
  // Build a fixture registry with one valid entry (non-secret test value shape).
  const now = new Date().toISOString();
  const plaintext = `tokens:
  - id: "11111111-1111-4111-8111-111111111111"
    label: "test-token-alpha"
    value: "sk-ant-oat01-TEST-FIXTURE-0000000000000000000000000000000000000000000"
    tier: "pro"
    owner_host: "mcow"
    enabled: true
    added_at: "${now}"
`;
  fs.writeFileSync(
    path.dirname(FIXTURE_REGISTRY_PLAIN) + "/.gitignore",
    "*\n",
  );
  fs.writeFileSync(FIXTURE_REGISTRY_PLAIN, plaintext);
  createEncryptedFixture(plaintext, FIXTURE_REGISTRY_SOPS);
});

afterAll(() => {
  _setSpawnSyncForTest(null);
  try { fs.unlinkSync(FIXTURE_REGISTRY_SOPS); } catch {}
  try { fs.unlinkSync(FIXTURE_REGISTRY_PLAIN); } catch {}
  try { fs.unlinkSync(path.dirname(FIXTURE_REGISTRY_PLAIN) + "/.gitignore"); } catch {}
  try { fs.rmdirSync(FIXTURE_DIR); } catch {}
});

describe("sopsAvailable()", () => {
  test("returns true when sops binary is on PATH", () => {
    _setSpawnSyncForTest(null);
    expect(sopsAvailable()).toBe(true);
  });

  test("returns false when sops binary exits with error", () => {
    // Inject a spawnSync that simulates missing binary.
    _setSpawnSyncForTest(
      (_cmd: string, _args: readonly string[]) =>
        ({
          status: null,
          signal: null,
          output: [],
          pid: 0,
          stdout: Buffer.from(""),
          stderr: Buffer.from("ENOENT"),
          error: Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }),
        }) as unknown as childProcess.SpawnSyncReturns<Buffer>,
    );
    expect(sopsAvailable()).toBe(false);
    _setSpawnSyncForTest(null);
  });
});

describe("decryptRegistry()", () => {
  test("parses a fixture SOPS file and returns typed TokenRegistry", async () => {
    _setSpawnSyncForTest(null);
    const reg = await decryptRegistry(FIXTURE_REGISTRY_SOPS);
    expect(reg.tokens).toHaveLength(1);
    expect(reg.tokens[0].label).toBe("test-token-alpha");
    expect(reg.tokens[0].tier).toBe("pro");
    expect(reg.tokens[0].enabled).toBe(true);
    expect(reg.tokens[0].value).toMatch(/^sk-ant-oat01-/);
  });

  test("throws SopsDecryptError when path does not exist", async () => {
    _setSpawnSyncForTest(null);
    await expect(
      decryptRegistry("/nonexistent/path/does-not-exist.sops.yaml"),
    ).rejects.toBeInstanceOf(SopsDecryptError);
  });

  test("throws SopsDecryptError when spawnSync exits non-zero", async () => {
    _setSpawnSyncForTest(
      (_cmd: string, _args: readonly string[]) =>
        ({
          status: 1,
          signal: null,
          output: [],
          pid: 0,
          stdout: Buffer.from(""),
          stderr: Buffer.from("simulated sops failure"),
        }) as unknown as childProcess.SpawnSyncReturns<Buffer>,
    );
    try {
      await expect(decryptRegistry("/anywhere.sops.yaml")).rejects.toBeInstanceOf(
        SopsDecryptError,
      );
    } finally {
      _setSpawnSyncForTest(null);
    }
  });
});

describe("setRegistryField() mutex", () => {
  test("concurrent setRegistryField calls serialize through mutex", async () => {
    const order: string[] = [];
    let active = 0;
    let maxActive = 0;

    _setSpawnSyncForTest((_cmd: string, args: readonly string[]) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      order.push(`start:${args[args.length - 1]}`);
      // Simulate work by doing a tight busy-loop sync delay.
      const until = Date.now() + 15;
      while (Date.now() < until) {
        // busy wait
      }
      order.push(`end:${args[args.length - 1]}`);
      active -= 1;
      return {
        status: 0,
        signal: null,
        output: [],
        pid: 0,
        stdout: Buffer.from(""),
        stderr: Buffer.from(""),
      } as unknown as childProcess.SpawnSyncReturns<Buffer>;
    });

    try {
      await Promise.all([
        setRegistryField("/fake-a", '["tokens"][0]["enabled"]', "true"),
        setRegistryField("/fake-b", '["tokens"][0]["enabled"]', "false"),
        setRegistryField("/fake-c", '["tokens"][0]["enabled"]', "true"),
      ]);
    } finally {
      _setSpawnSyncForTest(null);
    }

    expect(maxActive).toBe(1);
    // Order must be strictly serialized (each start→end completes before next start)
    expect(order).toEqual([
      "start:/fake-a",
      "end:/fake-a",
      "start:/fake-b",
      "end:/fake-b",
      "start:/fake-c",
      "end:/fake-c",
    ]);
  });
});

describe("replaceRegistry()", () => {
  test("writes plaintext to tmp, runs sops -e -i, atomically renames to target", async () => {
    _setSpawnSyncForTest(null);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sops-test-"));
    const target = path.join(tmpDir, "out.sops.yaml");
    try {
      const next: TokenRegistry = {
        tokens: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            label: "replaced-token",
            value:
              "sk-ant-oat01-REPLACED-FIXTURE-0000000000000000000000000000000000000000",
            tier: "max",
            owner_host: "mcow",
            enabled: false,
            added_at: new Date().toISOString(),
          },
        ],
      };
      await replaceRegistry(target, next);
      // Target must exist, tmp must NOT exist.
      expect(fs.existsSync(target)).toBe(true);
      expect(fs.existsSync(`${target}.tmp`)).toBe(false);
      // Round-trip decrypt should reproduce the same payload.
      const back = await decryptRegistry(target);
      expect(back.tokens).toHaveLength(1);
      expect(back.tokens[0].label).toBe("replaced-token");
      expect(back.tokens[0].enabled).toBe(false);
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });
});

describe("Error sanitization", () => {
  test("SopsDecryptError message never leaks sk-ant-oat01- substrings from stderr", () => {
    const fakeStderr =
      "critical failure parsing token sk-ant-oat01-LEAKED-FROM-STDERR-xxxxxxxx";
    const err = new SopsDecryptError("/some/path", fakeStderr);
    expect(err.message).not.toContain("sk-ant-oat01-LEAKED");
    expect(err.message).toContain("[REDACTED_TOKEN]");
    expect(err.toString()).not.toContain("sk-ant-oat01-LEAKED");
    expect(err.name).toBe("SopsDecryptError");
  });

  test("SopsWriteError message never leaks sk-ant-oat01- substrings from stderr", () => {
    const fakeStderr =
      "write failure involving sk-ant-oat01-ANOTHER-LEAK-yyyyyyyyyyyyyyy";
    const err = new SopsWriteError("/some/path", fakeStderr);
    expect(err.message).not.toContain("sk-ant-oat01-ANOTHER");
    expect(err.message).toContain("[REDACTED_TOKEN]");
    expect(err.toString()).not.toContain("sk-ant-oat01-ANOTHER");
    expect(err.name).toBe("SopsWriteError");
  });
});
