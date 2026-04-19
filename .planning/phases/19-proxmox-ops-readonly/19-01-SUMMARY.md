---
phase: 19-proxmox-ops-readonly
plan: 01
subsystem: ansible/proxmox/secrets
tags: [proxmox, ansible, sops, tls, secrets, homelab-admin]
dependency_graph:
  requires:
    - tower SSH + pveum
    - secrets/mcow.sops.yaml decryptable
    - deploy-homelab-admin.yml Stage 4 (homelab-admin-secrets.yml include)
  provides:
    - dashboard-operator@pve!readonly token on tower (privsep=0)
    - proxmox_dashboard.{token_secret,tower_ca_pem} in secrets/mcow.sops.yaml
    - /etc/homelab-admin/tower-ca.pem on mcow (0640)
    - PROXMOX_API_BASE / PROXMOX_TOKEN_ID / PROXMOX_TOKEN_SECRET / PROXMOX_CA_PATH in /etc/homelab-admin/env
  affects:
    - Plan 19-02 API proxy routes consume these env vars
tech_stack:
  added: []
  patterns: [pveum-idempotent-shell, sops-set-delegate-localhost, env-file-ca-pin]
key_files:
  created:
    - ansible/playbooks/provision-proxmox-dashboard-token.yml
  modified:
    - ansible/playbooks/tasks/homelab-admin-secrets.yml
    - secrets/mcow.sops.yaml
decisions:
  - "D-03 enforced — token role hard-coded to VM.Audit + Datastore.Audit only"
  - "pveum shell over community.proxmox (no token module yet); token_list guard prevents rotation"
  - "CA pinned via dedicated file + PROXMOX_CA_PATH env (consumer uses undici.Agent connect.ca)"
metrics:
  duration: ~12 min
  completed: 2026-04-19
  tasks: 4
  files_created: 1
  files_modified: 2
  commits: 3
requirements: [PROXMOX-06]
---

# Phase 19 Plan 01: Ansible Proxmox read-only token + CA provisioning — Summary

One-liner: Idempotent Ansible provisioning of `dashboard-operator@pve!readonly` token (VM.Audit+Datastore.Audit only) on tower + CA-pinned distribution to mcow's homelab-admin service via SOPS.

## SAN Precheck (Task 0 — Open Question A2)

`openssl s_client -connect tower:8006 -showcerts </dev/null | openssl x509 -noout -text | grep -A2 'Subject Alternative'` returned:

```
X509v3 Subject Alternative Name:
    IP Address:127.0.0.1, IP Address:0:0:0:0:0:0:0:1, DNS:localhost, IP Address:192.168.0.103, DNS:tower, DNS:tower.local
```

**Result:** `DNS:tower` is present in the SAN list. Plan 02 does **NOT** need `connect.servername` override — the default (hostname from URL = `tower`) matches the cert SAN directly. `NODE_TLS_REJECT_UNAUTHORIZED=0` is not required and MUST NOT be used.

## Provisioned Artifacts

| Artifact | Location | Value |
|----------|----------|-------|
| PVE role | tower | `DashboardReadOnly` (privs: `VM.Audit,Datastore.Audit`) |
| PVE user | tower | `dashboard-operator@pve` |
| PVE token | tower | `dashboard-operator@pve!readonly`, privsep=0 |
| SOPS key | secrets/mcow.sops.yaml | `proxmox_dashboard.token_secret` (UUID, encrypted) |
| SOPS key | secrets/mcow.sops.yaml | `proxmox_dashboard.tower_ca_pem` (2074-byte PEM, encrypted) |
| CA file  | mcow | `/etc/homelab-admin/tower-ca.pem` mode `0640` owner `homelab-admin:homelab-admin` |
| Env vars | mcow | `PROXMOX_API_BASE`, `PROXMOX_TOKEN_ID`, `PROXMOX_TOKEN_SECRET`, `PROXMOX_CA_PATH` in `/etc/homelab-admin/env` (mode 0600) |

## Idempotence Evidence

- 1st run: `ok=10 changed=4` (role, user, token_create, sops-set-token)
- 2nd run: `ok=7 changed=0 skipped=3` (token_create + capture + sops-set-token all skipped via `token_list` guard)
- Tower: `pveum user token list dashboard-operator@pve` → `readonly`, privsep=0 ✓

## Verification

- SOPS extract token_secret matches `^[a-f0-9-]{36}$` ✓
- SOPS extract tower_ca_pem begins with `-----BEGIN CERTIFICATE-----` ✓
- Full deploy-homelab-admin.yml: local /api/health → 200 ok=true; public /api/health → 200 ok=true ✓
- mcow: `ls /etc/homelab-admin/tower-ca.pem` → 0640 homelab-admin:homelab-admin ✓
- mcow: `grep -c '^PROXMOX_' /etc/homelab-admin/env` → 4 ✓
- mcow: `systemctl is-active homelab-admin` → `active` ✓

## Security Posture

- T-19-01 (token disclosure in stdout): mitigated — `no_log: true` on all 5 secret-touching tasks
- T-19-02 (accidental rotation): mitigated — `pveum user token list` guard, `when:` clause on `token add`
- T-19-03 (privilege creep): mitigated — role limited to `VM.Audit,Datastore.Audit`; no `VM.PowerMgmt`
- T-19-04 (MITM): mitigated — CA captured over SSH from tower itself; SAN precheck confirms `DNS:tower` on pveproxy cert
- T-19-05 (env-file readable): mitigated — mode 0600, owner homelab-admin; tower-ca.pem 0640 (service user readable only)
- ASVS V6 compliance: TLS pinning via pinned CA file, `NODE_TLS_REJECT_UNAUTHORIZED=0` NOT introduced

## Plan 02 Handoff

- Consumer may use `undici.Agent({ connect: { ca: readFileSync(process.env.PROXMOX_CA_PATH) } })` **without** setting `servername` — default (`tower` from URL) matches cert SAN.
- Auth header: `Authorization: PVEAPIToken=${PROXMOX_TOKEN_ID}=${PROXMOX_TOKEN_SECRET}`.
- Read-only endpoints only (see 19-RESEARCH §3). `VM.PowerMgmt` absent — any mutating call will 403.

## Commits

| Hash | Message |
|------|---------|
| db6f5d6 | feat(19-01): add idempotent Proxmox read-only token provisioning playbook |
| b099025 | feat(19-01): provision dashboard-operator@pve!readonly token + tower CA |
| 031429c | feat(19-01): render tower CA + PROXMOX_* env vars on mcow |

## Deviations from Plan

None — plan executed exactly as written. No Rule 1/2/3 auto-fixes required.

## Self-Check: PASSED

- FOUND: ansible/playbooks/provision-proxmox-dashboard-token.yml
- FOUND: ansible/playbooks/tasks/homelab-admin-secrets.yml (modified)
- FOUND: secrets/mcow.sops.yaml (modified, proxmox_dashboard block)
- FOUND: db6f5d6, b099025, 031429c
