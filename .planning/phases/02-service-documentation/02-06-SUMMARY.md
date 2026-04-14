---
phase: 02
plan: 06
subsystem: tooling / secret-gate
tags: [tailscale, scripts, secrets, verification, harness]
dependency-graph:
  requires: [02-01, 02-02, 02-03, 02-04, 02-05]
  provides: [SVC-05, phase-02-final-gate]
  affects: [scripts/, verify-phase02-harness]
tech-stack:
  added: []
  patterns:
    - standalone-bash-provisioning-script
    - env-var-secret-injection (`${VAR:?}` guard)
    - phase-wide-secret-sweep (git-ls-files + regex)
    - parallel-arrays-for-bash32-portability
key-files:
  created:
    - scripts/tailscale-provision.sh
    - scripts/README.md
    - scripts/verify-phase02.d/06-tailscale.sh
    - scripts/verify-phase02.d/99-final.sh
  modified: []
decisions:
  - D-10 standalone bash (no Ansible) for Tailscale provisioning
  - Secret-sweep regex widened to `tskey-[a-zA-Z0-9-]{10,}` to match real tskey-auth-... format
  - Sweep excludes `.planning/` and `scripts/verify-phase02.d/` (where the pattern legitimately appears as documentation/detection logic)
  - Parallel arrays (`REQ_PAIRS=("SVC-01:path" ...)`) instead of `declare -A` to stay portable to macOS bash 3.2
metrics:
  duration: ~25min
  completed: 2026-04-14
---

# Phase 02 Plan 06: Tailscale Provisioning + Phase-Wide Secret Gate Summary

Standalone `scripts/tailscale-provision.sh` that installs Tailscale and joins any Debian/Ubuntu host to the mesh given `TAILSCALE_AUTH_KEY`, plus a `scripts/README.md` index and a phase-wide `99-final.sh` harness snippet enforcing a secret-scan gate on every tracked file.

## What Shipped

### `scripts/tailscale-provision.sh` (SVC-05)
- Standalone bash, no Ansible dependency (per D-10)
- Reads `TAILSCALE_AUTH_KEY` via `${VAR:?...}` guard — exits early with clear error if missing
- No embedded secrets anywhere in the file
- Root check via `$EUID` — fails before any privileged call
- Idempotent: re-running with same auth key re-registers cleanly
- Defaults: `--accept-routes` on, `--accept-dns=false` (opt-in), optional `TAILSCALE_HOSTNAME` / `TAILSCALE_TAGS` env vars
- Uses official `https://tailscale.com/install.sh` for OS detection + repo setup

### `scripts/README.md`
- Inventory table of every script in `scripts/` (purpose, invocation target, secret inputs)
- Documents each `verify-phase02.d/NN-*.sh` snippet with SVC mapping
- Conventions block: `set -euo pipefail`, no embedded secrets, default-deny, audit logging

### `scripts/verify-phase02.d/06-tailscale.sh` (SVC-05 gate)
- Verifies `tailscale-provision.sh` is executable, parses, calls `tailscale up`, reads `TAILSCALE_AUTH_KEY`, contains no literal tskey
- Passes `bash -n` on itself; prints `SVC-05 OK`

### `scripts/verify-phase02.d/99-final.sh` (phase-wide gate)
1. **Secret sweep** across `git ls-files` output, excluding `.planning/` (docs that describe the pattern) and `scripts/verify-phase02.d/` (harness itself):
   - Literal `tskey-[a-zA-Z0-9-]{10,}` auth keys anywhere
   - Raw WireGuard `^(PrivateKey|PresharedKey) = [A-Za-z0-9+/]{40,}=*$` outside `*.sops.yaml`
   - Plaintext `GF_SECURITY_ADMIN_PASSWORD=...` in `servers/**/docker-compose*.yml`
2. **SVC-06 invalidation lock** — rejects any resurfaced `servers/tower-sat` or `lxc-101-tower-sat.conf`
3. **Requirement coverage summary** — every active SVC requirement (01, 02, 03, 04, 05, 07, 08) must have its named artifact present and non-empty

## Verification

```
=== 01-reconcile.sh ===  SVC-07 OK
=== 02-docker-tower.sh ===  SVC-01 OK
=== 03-mcow.sh ===  SVC-02 OK
=== 04-nether.sh ===  SVC-04 OK
=== 05-lxc.sh ===  SVC-03 OK / SVC-08 OK
=== 06-tailscale.sh ===  SVC-05 OK
=== 99-final.sh ===  PHASE 02 FINAL SWEEP OK (SVC-01..05, 07, 08; SVC-06 invalidated)
verify-phase02: all snippets passed
```

**Sanity test executed (not committed):** injected fake `tskey-auth-abcdefghij1234567890` into `scripts/tailscale-provision.sh`; both `06-tailscale.sh` and `99-final.sh` exited non-zero with `FAIL: literal Tailscale auth key found in tracked files` / `script contains literal tskey auth key`. Reverted with `git checkout`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] tskey regex missed the real Tailscale format**
- **Found during:** Task 3 sanity test
- **Issue:** Plan's regex `tskey-[a-zA-Z0-9]{10,}` does NOT match real Tailscale auth keys which embed hyphens after the `tskey-auth-` prefix (e.g. `tskey-auth-kabc...`). Sanity injection passed undetected.
- **Fix:** Widened character class to `tskey-[a-zA-Z0-9-]{10,}` in both `06-tailscale.sh` and `99-final.sh`. Sanity test now correctly fails.
- **Files modified:** scripts/verify-phase02.d/06-tailscale.sh, scripts/verify-phase02.d/99-final.sh
- **Commit:** a6453a9

**2. [Rule 3 - Blocking] `declare -A` incompatible with macOS bash 3.2**
- **Found during:** Task 3 first harness run
- **Issue:** Plan specified `declare -A req_artifact=(...)`; operator host runs macOS bash 3.2 which lacks associative arrays, producing `SVC: unbound variable` under `set -u`.
- **Fix:** Rewrote as parallel string array `REQ_PAIRS=("SVC-01:path" ...)` with `${pair%%:*}` / `${pair#*:}` parameter expansion. Portable to bash 3.2+.
- **Files modified:** scripts/verify-phase02.d/99-final.sh
- **Commit:** a6453a9

**3. [Rule 1 - Bug] Sweep exclusion list too narrow**
- **Found during:** Task 3 second sanity test
- **Issue:** Plan excluded only `02-06-PLAN.md` and `02-06-SUMMARY.md`, but an archived `_archived-2026-04-14/02-06-PLAN.md` also contains the example tskey pattern. The sweep would fail on the archive even in a clean repo.
- **Fix:** Broadened exclusion to whole `.planning/` tree and `scripts/verify-phase02.d/` (planning docs describe the pattern; harness snippets contain the detection regex). Everything operator-reachable remains in scope.
- **Files modified:** scripts/verify-phase02.d/99-final.sh
- **Commit:** a6453a9

## Known Stubs

None. All harness snippets enforce real artifact existence + non-emptiness and the provisioning script is runnable against a real host.

## Decisions Made

- **Exclusion scope:** `.planning/` + `scripts/verify-phase02.d/` excluded from tskey sweep. Rationale: planning docs legitimately describe the secret pattern (doc-as-code), and harness snippets carry the regex. Everything outside those two trees is operator-reachable and must be clean.
- **Portability floor:** bash 3.2. The operator runs macOS; target hosts run bash 4+. Writing to the lower bar costs nothing.
- **No SVC-06 artifact row in coverage table:** SVC-06 is invalidated (per 02-01 reconciliation); `99-final.sh` instead enforces an anti-regression check that tower-sat artifacts cannot resurface.

## Self-Check: PASSED

Files:
- FOUND: scripts/tailscale-provision.sh
- FOUND: scripts/README.md
- FOUND: scripts/verify-phase02.d/06-tailscale.sh
- FOUND: scripts/verify-phase02.d/99-final.sh

Commits:
- 842692c  feat(02-06): add tailscale-provision.sh standalone installer
- 047ddb3  docs(02-06): add scripts/ README index
- a6453a9  feat(02-06): add SVC-05 snippet and phase-wide final sweep

Harness: `bash scripts/verify-phase02.sh --quick` exits 0, all SVC-NN OK lines present, `PHASE 02 FINAL SWEEP OK` final line confirmed.
