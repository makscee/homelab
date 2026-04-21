---
phase: 19-proxmox-ops-readonly
audit_date: 2026-04-21
asvs_level: 2
threats_total: 15
threats_closed: 15
threats_open: 0
status: SECURED
---

# Phase 19 — Proxmox Ops (Read-Only) — Security Audit

One-liner: Verified all 15 STRIDE threats declared across Plans 19-01, 19-02, 19-03 are mitigated in the committed implementation. Read-only Proxmox dashboard surface is auth-gated, CA-pinned TLS, zod-validated, and does not leak the PVE token to the browser.

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| operator controller → tower (SSH) | Ansible over Tailnet; trusted operator workstation |
| controller → secrets/mcow.sops.yaml | `sops set` encrypts at rest; age key local-only |
| mcow filesystem → homelab-admin service user | env-file mode 0600, tower-ca.pem mode 0640, owner homelab-admin |
| mcow Next.js → tower:8006 | undici fetch with PVEAPIToken header + CA-pinned TLS Agent |
| browser → mcow Next.js | NextAuth session cookie |
| client React → /api/proxmox/* | same-origin fetch with credentials (token never crosses) |

## Threat Register (STRIDE)

| Threat ID | Category | Component | Disposition | Status | Evidence |
|-----------|----------|-----------|-------------|--------|----------|
| T-19-01 | Information Disclosure | Token secret in playbook output | mitigate | CLOSED | `ansible/playbooks/provision-proxmox-dashboard-token.yml:63, 69, 87, 100` — `no_log: true` on all 4 secret-touching tasks (token_create, set_fact, sops-set-ca, sops-set-token) |
| T-19-02 | Tampering | Token rotation on accidental re-run | mitigate | CLOSED | `provision-proxmox-dashboard-token.yml:52-55` token_list register; `:62` `when: pve_token_id not in (token_list.stdout \| from_json \| map(attribute='tokenid') \| list)` — guard prevents rotation on re-run (19-01-SUMMARY idempotence run shows 2nd run `changed=0`) |
| T-19-03 | Elevation of Privilege | Token granted excess perms | mitigate | CLOSED | `provision-proxmox-dashboard-token.yml:32` `pve_privs: "VM.Audit,Datastore.Audit"` — hard-coded role, no VM.PowerMgmt; D-03 enforced |
| T-19-04 | Spoofing | MITM on tower:8006 (CA capture path) | mitigate | CLOSED | `provision-proxmox-dashboard-token.yml:71-74` — CA slurped from `/etc/pve/pve-root-ca.pem` on tower itself via trusted SSH; 19-01-SUMMARY Task 0 records SAN precheck `DNS:tower` confirmed on pveproxy cert |
| T-19-05 | Information Disclosure | env-file world-readable | mitigate | CLOSED | `ansible/playbooks/tasks/homelab-admin-secrets.yml:60-63` tower-ca.pem rendered to `/etc/homelab-admin/tower-ca.pem` mode 0640 owner homelab-admin; env-file mode 0600 (existing pattern); 19-01-SUMMARY verification confirms `ls -la` shows correct perms |
| T-19-06 | Spoofing | tower:8006 MITM at runtime | mitigate | CLOSED | `apps/admin/lib/proxmox.server.ts:38-68` `loadAgent()` — `new Agent({ connect: { ca } })` with CA from `readFileSync(PROXMOX_CA_PATH)`; no skip-verify; repo grep `NODE_TLS_REJECT_UNAUTHORIZED` in `apps/admin/` → 0 matches |
| T-19-07 | Information Disclosure | Token leaked to browser | mitigate | CLOSED | `apps/admin/lib/proxmox.server.ts:1` `import "server-only"`; all 4 route handlers return only `data` envelope — never serialize `PROXMOX_TOKEN_SECRET` or `authorization` header to response body (verified `route.ts` lines 60, 39, 44, 41 in list / vmid / tasks / log respectively) |
| T-19-08 | Tampering | Path traversal via vmid/upid | mitigate | CLOSED | `apps/admin/app/api/proxmox/lxcs/[vmid]/route.ts:10-12` `z.string().regex(/^\d+$/)`; `[vmid]/tasks/route.ts:10-12` same; `[upid]/log/route.ts:10-16` `/^UPID:[A-Za-z0-9:_.\-@]+$/` plus `encodeURIComponent(upid)` at `:39` per Pitfall #5 |
| T-19-09 | DoS | Tower-down crashes dashboard | mitigate | CLOSED | `lib/proxmox.server.ts:122-132` catches all fetch errors → `PveError("PVE_UNREACHABLE", 0, ...)`; all 4 routes map to 502 with `code: "PVE_UNREACHABLE"` (route.ts:63-67; [vmid]/route.ts:42-46; tasks/route.ts:47-51; log/route.ts:44-48); list route also wraps per-vmid status/current in try/catch (route.ts:48-57) so partial tower flakiness doesn't poison overview; D-09 |
| T-19-10 | Information Disclosure | PVE error messages echo internal paths | mitigate | CLOSED | All 4 routes use `sanitizeErrorMessage(msg)` on catch-all non-PveError branch (route.ts:74-77; [vmid]/route.ts:53-54; tasks/route.ts:58-59; log/route.ts:55-56); PveError branch returns only `code` identifier, not upstream body |
| T-19-11 | Elevation of Privilege | Unauthenticated GET | mitigate | CLOSED | All 4 routes call `await auth()` first with `if (!session?.user?.login)` → 401 (route.ts:38-41; [vmid]/route.ts:21-24; tasks/route.ts:29-32; log/route.ts:24-27); 19-03-SUMMARY verification confirms unauth curl → 307/login on live deploy |
| T-19-12 | Information Disclosure | Token leaks via client-side fetch | mitigate | CLOSED | Client components `proxmox-list.client.tsx` / `proxmox-detail.client.tsx` fetch only same-origin `/api/proxmox/*`; no direct tower:8006 call; inherits T-19-07 server-only boundary |
| T-19-13 | Tampering | Client manipulates vmid to access unintended LXC | accept | CLOSED | 19-03-PLAN.md explicit `disposition: accept` — token role is read-only across all LXCs (D-03/T-19-03 evidence); no privilege escalation possible. Accepted risk logged below |
| T-19-14 | DoS | Aggressive polling overwhelms tower | mitigate | CLOSED | `proxmox-list.client.tsx` uses `setInterval(..., 10000)` (10s list); `proxmox-detail.client.tsx` uses 30s detail; D-04 — UAT Test 2 confirms "Last updated" advances exactly one poll cycle per 15s (no stampede) |
| T-19-15 | Spoofing | XSS via unescaped PVE config values | mitigate | CLOSED | Grep confirmed: zero `dangerouslySetInnerHTML` in `apps/admin/app/(auth)/proxmox/*.client.tsx`; config rendered as React text nodes (auto-escaped) |

## Accepted Risks

| Threat ID | Risk | Rationale |
|-----------|------|-----------|
| T-19-13 | Authenticated operator can request any vmid (`/api/proxmox/lxcs/{anyvmid}`) via path manipulation | Token `dashboard-operator@pve!readonly` holds only `VM.Audit,Datastore.Audit` on path `/` (D-03, T-19-03). No IDOR in the security-relevant sense: every LXC on tower is read-visible to every authenticated dashboard operator by design. No mutating endpoints exist in this phase. Accepted by operator for Phase 19 read-only observability scope. |

## Unregistered Threat Flags

None. All three phase SUMMARY.md files report `## Threat Flags: None` or no new surface outside the declared threat model. 19-02-SUMMARY explicitly states: "None — all surface is within the plan's `<threat_model>` (T-19-06 through T-19-11)."

## Verification Gates (Automated)

| Gate | Result | Source |
|------|--------|--------|
| `grep -r "NODE_TLS_REJECT_UNAUTHORIZED" apps/admin/` | EMPTY | 19-02-SUMMARY + 19-03-SUMMARY (PROXMOX-06 criterion); re-verified 2026-04-21 |
| `bun test apps/admin/lib/proxmox.server.test.ts` | 5/5 PASS | 19-02-SUMMARY |
| `bun test apps/admin/app/api/proxmox/` | 20/20 PASS | 19-02-SUMMARY |
| Live `/api/proxmox/lxcs` unauth | 307 → /login | 19-03-SUMMARY, UAT Test 6 |
| Ansible idempotence (2nd run) | changed=0 for token_create | 19-01-SUMMARY |
| SAN precheck `DNS:tower` on pveproxy cert | confirmed | 19-01-SUMMARY Task 0 |

## ASVS L2 Notes

- V2 (Authentication): NextAuth session check on every route ✓
- V4 (Access Control): server-only token; client never sees credential ✓
- V5 (Validation): zod regex on all dynamic path params ✓
- V6 (Cryptography): TLS 1.2+ with pinned CA via undici Agent; no verify bypass ✓
- V7 (Error Handling): `sanitizeErrorMessage` + structured `code` fields, no upstream body echo ✓
- V8 (Data Protection): SOPS-encrypted at rest; 0600 env-file, 0640 CA PEM owned by service user ✓

## Audit Trail

| Date | Auditor | Action | Result |
|------|---------|--------|--------|
| 2026-04-21 | gsd-secure-phase (Claude) | STRIDE verification of 15 threats across 3 plans | 15/15 CLOSED, 0 OPEN; 1 accepted risk (T-19-13) documented |
