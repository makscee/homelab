# Phase 19: Proxmox Ops (read-only) — Research

**Researched:** 2026-04-19
**Domain:** Proxmox VE API integration in Next.js 15 / Bun admin app
**Confidence:** HIGH (auth, repo patterns, SOPS); MEDIUM (community.proxmox token module — fall back to `pveum` shell)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01** Raw `fetch` (Bun native) + `Authorization: PVEAPIToken=<user>@pve!<tokenid>=<secret>` header. CA pinned via `tls.createSecureContext({ca})` on `undici.Agent`. No third-party proxmox client.
- **D-02** Ansible Plan 01 provisions `dashboard-operator@pve` user, `DashboardReadOnly` role (`VM.Audit`+`Datastore.Audit`), token `readonly`, writes secret + tower CA into `secrets/mcow.sops.yaml`.
- **D-03** Token strictly read-only. No `VM.PowerMgmt`.
- **D-04** List poll 10s; detail poll 30s; manual refresh; no SSE.
- **D-05** No audit-log writes this phase.
- **D-06** Routes: `/proxmox` list, `/proxmox/[vmid]` detail under `apps/admin/app/(auth)/`.
- **D-07** Proxy routes: `/api/proxmox/lxcs`, `/api/proxmox/lxcs/[vmid]`, `/api/proxmox/lxcs/[vmid]/tasks`. Server-only.
- **D-08** Detail panel pulls last 20 tasks, click-to-expand log. No live shell.
- **D-09** Network errors render red banner; dashboard remains usable if tower down.

### Claude's Discretion
- Component structure, polling library (likely native `setInterval` + SWR pattern from existing pages), error banner copy, log expansion UX.

### Deferred Ideas (OUT OF SCOPE)
- PROXMOX-02 (power ops), PROXMOX-03 (spawn), PROXMOX-04 (destroy), live shell, audit-log writes.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROXMOX-01 | List LXCs on tower with status/resources/uptime | §3 endpoints `/nodes/tower/lxc` + `/lxc/{vmid}/status/current` |
| PROXMOX-05 | Detail panel: config dump, recent task log, network info | §3 endpoints `/lxc/{vmid}/config`, `/tasks?vmid=`, `/tasks/{upid}/log` |
| PROXMOX-06 | API token + tight role, CA-pinned TLS, secrets in SOPS | §1 Ansible provisioning, §2 CA pinning, §5 SOPS injection |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- All inter-server comms via Tailnet (mcow → tower hostname is `tower` via MagicDNS, port 8006).
- Secrets globally managed via SOPS+age; consumer apps read from `secrets/<host>.sops.yaml`.
- Ansible is the IaC layer; idempotent playbooks required.
- Operator is Claude Code — playbooks must be unambiguous.

---

## Summary

Proxmox VE 8 exposes `/api2/json/*` over HTTPS:8006 with a self-signed CA at `/etc/pve/pve-root-ca.pem`. API tokens use the header form `Authorization: PVEAPIToken=USER@REALM!TOKENID=SECRET` and inherit the role/permissions explicitly granted to the token (or its parent user when `privsep=0`). For idempotent provisioning we use `pveum` via Ansible `command` modules with `creates:`/`changed_when` guards — the `community.proxmox` collection covers `proxmox_user` and `proxmox_access_acl` but token creation is best done through `pveum user token add ... --output-format json` because it's the only path that returns the secret value (only on creation; never retrievable later). Tower CA cert is fetched once via `ansible.builtin.fetch`, embedded in `secrets/mcow.sops.yaml` as a base64 blob, rendered to disk on mcow during deploy at `/etc/homelab-admin/tower-ca.pem`, and consumed in API routes via `new undici.Agent({ connect: { ca } })` passed as the `dispatcher` option to native `fetch`.

**Primary recommendation:** Mirror `apps/admin/app/api/tokens/route.ts` exactly for the new `/api/proxmox/*` routes (auth → CSRF for mutations only → SOPS-backed env → upstream call → typed response with `runtime = "nodejs"`). Provision token+CA via a single Ansible play that runs `pveum` commands with `creates:` guards and writes results into SOPS via `sops set`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Token + role provisioning | Ansible (controller) | Proxmox PAM | One-shot, idempotent, secret captured into SOPS |
| CA fetch + storage | Ansible (controller) → SOPS | mcow filesystem | Cert distributed via deploy env-file render |
| Proxmox API client | Next.js Node runtime (mcow) | — | Server-only; client never sees token or CA |
| Polling | Browser (admin app) | — | `setInterval` against own `/api/proxmox/*` proxy |
| TLS pinning | Node `tls` + `undici.Agent` | — | No `NODE_TLS_REJECT_UNAUTHORIZED=0` |

---

## §1 — Proxmox API Token + Role Creation via Ansible

**Strategy:** `pveum` shell commands with `creates:` and `changed_when` guards. The `community.proxmox` collection has `proxmox_user`/`proxmox_access_acl` modules but no production-ready `proxmox_user_token` module yet [VERIFIED: collection docs index 2026-04, no `*_token` module listed]. Shell is acceptable here because `pveum` is itself idempotent for role/user/acl operations.

```yaml
# ansible/playbooks/provision-proxmox-dashboard-token.yml (run on tower)
- hosts: tower
  become: true
  vars:
    pve_role: DashboardReadOnly
    pve_user: dashboard-operator@pve
    pve_token_id: readonly
    pve_privs: "VM.Audit,Datastore.Audit"
  tasks:
    - name: Create read-only role (idempotent — pveum role add fails if exists)
      ansible.builtin.command: "pveum role add {{ pve_role }} -privs {{ pve_privs }}"
      register: role_add
      failed_when: role_add.rc != 0 and 'already exists' not in role_add.stderr
      changed_when: role_add.rc == 0

    - name: Create dashboard user
      ansible.builtin.command: "pveum user add {{ pve_user }} --comment 'mcow homelab-admin read-only'"
      register: user_add
      failed_when: user_add.rc != 0 and 'already exists' not in user_add.stderr
      changed_when: user_add.rc == 0

    - name: Grant role at root path
      ansible.builtin.command: "pveum acl modify / -user {{ pve_user }} -role {{ pve_role }}"
      changed_when: false  # idempotent: pveum acl modify is a SET, not ADD

    - name: Check if token already exists
      ansible.builtin.command: "pveum user token list {{ pve_user }} --output-format json"
      register: token_list
      changed_when: false

    - name: Create API token (privsep=0 → token inherits user's perms)
      ansible.builtin.command: >
        pveum user token add {{ pve_user }} {{ pve_token_id }}
        --privsep 0 --output-format json
      register: token_create
      when: pve_token_id not in (token_list.stdout | from_json | map(attribute='tokenid') | list)

    - name: Capture token secret (only available at creation time)
      ansible.builtin.set_fact:
        proxmox_token_secret: "{{ (token_create.stdout | from_json).value }}"
      when: token_create is changed
      no_log: true

    - name: Persist token secret into SOPS (delegate to controller)
      delegate_to: localhost
      become: false
      ansible.builtin.shell: |
        sops set secrets/mcow.sops.yaml \
          '["proxmox_dashboard"]["token_secret"]' '"{{ proxmox_token_secret }}"'
      when: proxmox_token_secret is defined
      no_log: true
```

**Notes:**
- Token secret is **only returned on creation** [VERIFIED: pveum man page]. If lost, delete + recreate token (`pveum user token remove`).
- `--privsep 0` makes the token inherit the user's permissions verbatim; with `privsep=1` you'd need a second `pveum acl modify ... -token` call.
- Full token id used in API auth header is `dashboard-operator@pve!readonly`.

## §2 — CA Cert Retrieval, SOPS Storage, undici Pinning

### Fetch CA on tower → store in SOPS

```yaml
- name: Fetch tower PVE root CA
  ansible.builtin.slurp:
    src: /etc/pve/pve-root-ca.pem
  register: pve_ca

- name: Write CA into SOPS (controller-side)
  delegate_to: localhost
  become: false
  ansible.builtin.shell: |
    sops set secrets/mcow.sops.yaml \
      '["proxmox_dashboard"]["tower_ca_pem"]' \
      "$(printf '%s' '{{ pve_ca.content | b64decode }}' | jq -Rs .)"
  no_log: true
```

### Render CA on mcow during admin deploy

Add to `tasks/homelab-admin-secrets.yml` (Plan reuses existing pattern):

```yaml
- name: Render tower CA cert
  ansible.builtin.copy:
    content: "{{ _hla_secrets.proxmox_dashboard.tower_ca_pem }}"
    dest: "{{ _homelab_admin_env_dir }}/tower-ca.pem"
    owner: "{{ _homelab_admin_service_user }}"
    group: "{{ _homelab_admin_service_group }}"
    mode: '0640'
  no_log: true
```

And append to env-file:
```
PROXMOX_API_BASE=https://tower:8006/api2/json
PROXMOX_TOKEN_ID=dashboard-operator@pve!readonly
PROXMOX_TOKEN_SECRET={{ _hla_secrets.proxmox_dashboard.token_secret }}
PROXMOX_CA_PATH=/etc/homelab-admin/tower-ca.pem
```

### `apps/admin/lib/proxmox.server.ts` (minimal client)

```ts
import "server-only";
import { readFileSync } from "node:fs";
import { Agent, fetch as undiciFetch } from "undici";

let _agent: Agent | null = null;
function agent(): Agent {
  if (_agent) return _agent;
  const ca = readFileSync(process.env.PROXMOX_CA_PATH!, "utf8");
  _agent = new Agent({
    connect: { ca, servername: "tower" }, // SNI must match cert CN/SAN
  });
  return _agent;
}

export async function pveGet<T>(path: string): Promise<T> {
  const base = process.env.PROXMOX_API_BASE!;
  const tokenId = process.env.PROXMOX_TOKEN_ID!;
  const secret = process.env.PROXMOX_TOKEN_SECRET!;
  const res = await undiciFetch(`${base}${path}`, {
    headers: { Authorization: `PVEAPIToken=${tokenId}=${secret}` },
    dispatcher: agent(),
  });
  if (!res.ok) throw new Error(`pve ${path} → ${res.status}`);
  const json = (await res.json()) as { data: T };
  return json.data;
}
```

**Why undici:** Bun's native `fetch` accepts `dispatcher` (undici-compatible) but for Node runtime mode (which we pin via `runtime = "nodejs"` per existing route convention) `undici.fetch` is the explicit, version-stable path [VERIFIED: undici docs `Agent.connect.ca`]. Avoids the `https.Agent` + manual `request` ergonomics.

**SAN warning:** `pve-root-ca.pem` is the ROOT cert; the cert presented by `:8006` is `pveproxy-ssl.pem` signed by it. CN/SAN is the node hostname (`tower`). If MagicDNS resolves `tower` to the Tailnet IP but the cert SAN is `tower.localdomain`, set `connect.servername = '<actual SAN>'`. Verify with `openssl s_client -connect tower:8006 -showcerts </dev/null | openssl x509 -noout -text | grep -A1 'Subject Alternative'` before finalizing the plan.

## §3 — Proxmox API Endpoints

All under `https://tower:8006/api2/json`. `data` field wraps the response payload [VERIFIED: PVE API viewer].

| Method | Path | Returns | Used For |
|--------|------|---------|----------|
| GET | `/nodes/tower/lxc` | array of `{vmid, name, status, uptime, cpus, maxmem, maxdisk, ...}` | List page |
| GET | `/nodes/tower/lxc/{vmid}/status/current` | `{status, uptime, cpu, mem, maxmem, netin, netout, ...}` | Per-row live stats / detail header |
| GET | `/nodes/tower/lxc/{vmid}/config` | flat key/value config (`hostname`, `cores`, `memory`, `net0`, `rootfs`, ...) | Detail config dump + network parsing |
| GET | `/nodes/tower/tasks?vmid={vmid}&limit=20` | array of `{upid, type, status, starttime, endtime, user}` | Recent task list |
| GET | `/nodes/tower/tasks/{upid}/log?start=0&limit=500` | array of `{n, t}` log lines | Task log expansion |

**Auth header (confirmed):** `Authorization: PVEAPIToken=USER@REALM!TOKENID=SECRET` — note the literal `=` between token-id and secret. [VERIFIED: PVE wiki "Proxmox VE API#API_Tokens"]

**Network info parsing:** `net0` config value is a CSV like `name=eth0,bridge=vmbr0,hwaddr=AA:BB:..,ip=10.10.20.204/24,gw=10.10.20.1`. Parse client-side or in the API route into `{name, bridge, hwaddr, ip, gw}`.

## §4 — Repo API Proxy Pattern (mirror this)

`apps/admin/app/api/tokens/route.ts` defines the canonical proxy pattern: (1) `export const runtime = "nodejs"` because SOPS spawns child processes; (2) `auth()` from `@/auth` → 401 unauthed BEFORE any side channel; (3) `verifyCsrf(req)` for mutations (skip for read-only GETs in this phase); (4) zod input validation when params exist; (5) call domain helper, wrap thrown errors via `sanitizeErrorMessage`; (6) on writes, call `logAudit` with `{action, target, payload, user, ip}`. New `/api/proxmox/*` routes are GET-only — drop steps 2 (CSRF) and 6 (audit), keep auth + runtime pin + zod validation of `vmid` (`z.string().regex(/^\d+$/)`) + sanitized error responses. The Proxmox upstream call lives in `apps/admin/lib/proxmox.server.ts` (see §2) — routes only orchestrate auth and shape the response.

## §5 — SOPS Integration

**Pattern in use** (verified by reading `tasks/homelab-admin-secrets.yml`): SOPS decryption happens **once at deploy time, on the controller**, NOT at runtime in the app. The controller runs `sops --decrypt --extract '["homelab_admin"]' --output-type json secrets/mcow.sops.yaml`, parses to `_hla_secrets`, and renders `/etc/homelab-admin/env` (mode 0600, owned by `homelab-admin`) on mcow. Systemd loads that env-file via `EnvironmentFile=` directive in `homelab-admin.service`. The Next.js process reads `process.env.X` — no SOPS at runtime, no `sops` binary needed on mcow.

**Why two SOPS layers exist:** `apps/admin/lib/sops.server.ts` is for the *Claude tokens registry* (a separate encrypted file that mutates at runtime via UI), NOT for app secrets. Phase 19 follows the deploy-time pattern only.

**Plan implication:** Add a `proxmox_dashboard:` block to `secrets/mcow.sops.yaml` with `token_secret` and `tower_ca_pem`. Extend `tasks/homelab-admin-secrets.yml` to (a) emit `PROXMOX_*` env vars and (b) render `/etc/homelab-admin/tower-ca.pem`. Restart of `homelab-admin.service` (already a handler) picks up new env on next deploy.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTPS with custom CA | `https.Agent` ad-hoc | `undici.Agent({connect:{ca}})` + `dispatcher` | Stable API, matches `fetch` shape |
| Proxmox JSON client | npm `proxmox-api` / `node-proxmox` | Native `fetch` + token header | Both packages stale (last release > 3y); 5-line client suffices |
| Token storage | env vars in playbook | SOPS+age (existing pattern) | Already the project standard |
| Polling | SWR / react-query install | `setInterval` + `useEffect` (mirror existing overview) | Smaller surface; matches repo style |

## Common Pitfalls

1. **`NODE_TLS_REJECT_UNAUTHORIZED=0`** — banned by D-09 success criteria. Repo grep must be clean.
2. **SAN mismatch** — `tower` hostname vs cert CN. Override with `connect.servername`.
3. **Token secret unrecoverable** — only shown at creation. Plan must `sops set` immediately on Ansible run, not in a follow-up task.
4. **`privsep=1` confusion** — token created with default privsep gets *no* permissions until you ACL the token id explicitly. Use `--privsep 0` to inherit user perms.
5. **Tasks endpoint UPID encoding** — UPIDs contain colons (`UPID:tower:0001A2B3:...`). Already URL-safe but pass through `encodeURIComponent` in the route param.
6. **Tower-down UX** — `fetch` to unreachable host throws `ECONNREFUSED` / `ETIMEDOUT`. Catch in route, return `{error: "tower unreachable", code: "PVE_UNREACHABLE"}` with HTTP 502 so client can render banner without breaking layout.

## Validation Architecture

| Property | Value |
|----------|-------|
| Framework | bun test + Vitest-compatible existing in `apps/admin/lib/*.test.ts` |
| Quick run | `cd apps/admin && bun test lib/proxmox.server.test.ts` |
| Full suite | `cd apps/admin && bun test` |
| E2E | Playwright smoke per success criteria (CT 100/101/204 visible) |

### Phase Requirements → Test Map

| Req | Behavior | Test Type | Command | File |
|-----|----------|-----------|---------|------|
| PROXMOX-01 | List page renders ≥3 LXCs | playwright | `bun run test:e2e proxmox-list` | ❌ Wave 0 |
| PROXMOX-05 | Detail panel opens for CT 101 | playwright | `bun run test:e2e proxmox-detail` | ❌ Wave 0 |
| PROXMOX-06 | No `NODE_TLS_REJECT_UNAUTHORIZED=0` in repo | grep | `! grep -r NODE_TLS_REJECT_UNAUTHORIZED apps/ ansible/` | ✅ |
| PROXMOX-06 | CA-pinned client rejects untrusted cert | unit | `bun test lib/proxmox.server.test.ts` | ❌ Wave 0 |
| PROXMOX-06 | Ansible re-run yields all-ok | manual | `ansible-playbook ... --check` | ✅ |

### Wave 0 Gaps
- `apps/admin/lib/proxmox.server.test.ts` — unit tests for `pveGet` (mock undici, assert auth header + CA path)
- `apps/admin/e2e/proxmox-list.spec.ts`, `proxmox-detail.spec.ts`
- `ansible/playbooks/provision-proxmox-dashboard-token.yml` — new playbook

## Security Domain

| ASVS | Applies | Control |
|------|---------|---------|
| V2 AuthN | yes | NextAuth GitHub OAuth (existing) |
| V4 Access Control | yes | Token role limited to `VM.Audit`+`Datastore.Audit` (D-03) |
| V5 Input Validation | yes | zod on `vmid` path param |
| V6 Cryptography | yes | TLS pinning via undici `connect.ca` — no plaintext, no skip-verify |
| V9 Communications | yes | All comms via Tailnet; Proxmox HTTPS with pinned CA |

| Threat | STRIDE | Mitigation |
|--------|--------|------------|
| MITM on tower:8006 | Spoofing | CA pinning (D-01) |
| Token leak via client | Info disclosure | Token never crosses to browser; server-only proxy (D-07) |
| Privilege escalation via token | Elevation | Role grants only `*.Audit` (D-03) |
| Stale token after rotation | Tampering | `pveum user token modify` updates expire; phase out-of-scope but planner notes manual rotation runbook |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Proxmox VE on tower | API target | ✓ | 8.x | — |
| `pveum` CLI on tower | Provisioning | ✓ (PVE-bundled) | — | — |
| `community.proxmox` collection | Optional, for `proxmox_user` | check | — | shell `pveum` (used in §1) |
| `sops` on controller | Secret writes | ✓ | 3.9+ | — |
| undici on mcow | TLS pinning | ✓ (Next.js dep) | bundled | — |

## Implementation Cookbook (planner-ready)

**Wave 0 — scaffolding**
1. Create `apps/admin/lib/proxmox.server.ts` (client per §2) + matching `*.test.ts`.
2. Create empty `apps/admin/app/(auth)/proxmox/page.tsx` and `[vmid]/page.tsx`.
3. Create empty `apps/admin/app/api/proxmox/lxcs/route.ts` + `[vmid]/route.ts` + `[vmid]/tasks/route.ts`, each with `runtime="nodejs"` + `auth()` gate returning 501.

**Wave 1 — provisioning**
4. Write `ansible/playbooks/provision-proxmox-dashboard-token.yml` (per §1).
5. Run play; verify SOPS now contains `proxmox_dashboard.token_secret` + `tower_ca_pem`.
6. Extend `tasks/homelab-admin-secrets.yml` to emit `PROXMOX_*` env + render `/etc/homelab-admin/tower-ca.pem`.

**Wave 2 — read paths**
7. Implement `/api/proxmox/lxcs` (calls `pveGet('/nodes/tower/lxc')`).
8. Implement `/api/proxmox/lxcs/[vmid]` (parallel `Promise.all` for `status/current` + `config`; parse `net0`).
9. Implement `/api/proxmox/lxcs/[vmid]/tasks` (list + on `?upid=` query, fetch log).
10. Implement `/proxmox` list page with 10s `setInterval` poll + manual refresh button + red error banner on `502 PVE_UNREACHABLE`.
11. Implement `/proxmox/[vmid]` detail page with 30s poll + click-to-expand task log.

**Wave 3 — verification**
12. Playwright smoke (CT 100/101/204 visible; detail panel opens for 101).
13. Repo grep: `! grep -r NODE_TLS_REJECT_UNAUTHORIZED apps/ ansible/`.
14. Re-run provisioning play (idempotent — should be all-ok).
15. Deploy admin via existing `deploy-homelab-admin.yml`; verify `/proxmox` live on `https://homelab.makscee.ru`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `community.proxmox` lacks `proxmox_user_token` module | §1 | LOW — shell `pveum` works regardless |
| A2 | Tower cert SAN matches `tower` MagicDNS name | §2 | MED — fix with `connect.servername` override; verify with `openssl s_client` before locking plan |
| A3 | `net0` config CSV format stable across PVE 8.x | §3 | LOW — documented in PVE wiki; parser is defensive |
| A4 | systemd `EnvironmentFile=` directive present in `homelab-admin.service` | §5 | LOW — pattern in use per playbook stage 8; verify file in plan wave 0 |

## Sources

- [PVE API viewer — /nodes/{node}/lxc](https://pve.proxmox.com/pve-docs/api-viewer/index.html)
- [PVE wiki — Proxmox VE API, API Tokens section](https://pve.proxmox.com/wiki/Proxmox_VE_API)
- [pveum man page](https://pve.proxmox.com/pve-docs/pveum.1.html)
- [undici Agent docs — connect.ca](https://undici.nodejs.org/#/docs/api/Agent)
- [community.proxmox collection index](https://docs.ansible.com/ansible/latest/collections/community/proxmox/index.html)
- Repo: `apps/admin/app/api/tokens/route.ts`, `apps/admin/lib/sops.server.ts`, `ansible/playbooks/tasks/homelab-admin-secrets.yml`

## Metadata

- Standard stack: HIGH — undici/fetch/SOPS/pveum all verified
- Architecture: HIGH — mirrors existing `tokens` route + secrets task
- Pitfalls: MEDIUM — SAN mismatch and privsep are common bite-points
- Research date: 2026-04-19 | Valid until: 2026-05-19
