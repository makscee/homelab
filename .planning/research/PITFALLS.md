# Domain Pitfalls: Homelab IaC

**Domain:** Homelab infrastructure-as-code with AI operator
**Researched:** 2026-04-13
**Specific context:** 6 servers (Moscow + Netherlands), Tailscale mesh, Proxmox LXCs, Claude Code as operator

---

## Critical Pitfalls

### Pitfall 1: Secrets Leaking Into the Repo

**What goes wrong:** Environment variables, API keys, Tailscale auth keys, and WireGuard private keys end up committed in `.env` files, Docker Compose files, or Ansible vars. This is the #1 homelab IaC failure mode.

**Why it happens:** Convenience. You test a compose file with a hardcoded password, it works, you commit it. Or a `.env.example` becomes `.env` and gets added accidentally.

**Consequences:** Public or semi-public repo exposure. Rotating credentials across 6 servers is painful. Claude Code could read and log secrets during operations.

**Prevention:**
- All secrets live at hub level only — homelab repo contains only references (`${SECRET_NAME}`)
- `.gitignore` must include `.env`, `*.key`, `*.pem`, `wg*.conf` (private keys), `authkey` files from day 0
- Claude Code runbooks must explicitly note: "do not log or echo secret values during execution"
- Use a secrets injection pattern: hub provides env at deploy time, not stored in homelab repo

**Detection:** `git log --all --full-diff -p | grep -i password` — run before any push

**Phase mapping:** Must be solved in Phase 1 (inventory/foundations) before any compose files are committed

---

### Pitfall 2: Config Exists in Repo But Isn't What's Actually Running

**What goes wrong:** You commit a Docker Compose file, then tweak the running container manually via `docker exec` or direct file edits on the server. The repo diverges from reality. When disaster strikes, you redeploy from repo and get a broken or outdated state.

**Why it happens:** "I'll just fix this quickly" + no enforcement mechanism. Especially common when a service requires a hotfix at 2am.

**Consequences:** The core promise — rebuild from repo alone — is silently broken. You don't find out until a real disaster.

**Prevention:**
- Every change to a running service must go through repo first, then deploy — not the reverse
- Claude Code runbooks must include a "verify running state matches repo" step before marking a deployment complete
- Periodic drift detection: script that diffs running containers against compose definitions
- If a manual fix was necessary, create a follow-up task to codify it within 24h

**Detection:** `docker inspect <container>` vs compose file — mismatched image tags, env vars, or mount points reveal drift

**Phase mapping:** Document this constraint in runbooks from Phase 1; automate drift detection in a later monitoring phase

---

### Pitfall 3: Stateful Data Treated as Infrastructure

**What goes wrong:** Jellyfin metadata, Navidrome library DB, *arr databases, qBittorrent state — all live in Docker volumes. The compose file is in the repo. The data is not. "Rebuild from repo" reconstructs the service but loses all state.

**Why it happens:** IaC thinking conflates "service definition" with "service state." The repo can describe a Jellyfin container perfectly but cannot hold 200GB of scanned media metadata.

**Consequences:** After a server rebuild, Jellyfin re-scans everything (hours), *arr databases are empty (lost history, custom formats), Navidrome loses playlists.

**Prevention:**
- Treat stateful volumes as a separate concern from IaC — document exactly which paths need backup per service
- Each service definition in the repo must have a sibling `BACKUP.md` listing: volume paths, backup frequency needed, restore procedure
- Backup is not part of IaC — it runs separately on a schedule and stores to a different target
- Restore procedure must be tested, not just written

**Detection:** List all named volumes and bind mounts across all compose files — any path containing `db`, `data`, `config`, `library` is stateful and needs a backup plan

**Phase mapping:** Phase 1 (inventory) should catalog all stateful paths; Phase 2+ should define backup procedures per service

---

### Pitfall 4: Runbooks Too Ambiguous for AI Operator Execution

**What goes wrong:** Claude Code reads a runbook like "update the monitoring stack" and takes actions based on its interpretation — which may differ from intent. Or a runbook has a conditional ("if the service is unhealthy, restart it") with no definition of "unhealthy."

**Why it happens:** Runbooks written for humans tolerate ambiguity because humans apply judgment. Claude Code applies rules.

**Consequences:** Wrong service restarted, wrong server targeted, partial migration executed, data loss from a misunderstood "rebuild" step.

**Prevention:**
- Every runbook must specify: exact server(s) to target, exact commands in order, expected output/exit code for each step, explicit stop conditions
- Avoid relative references ("the tower") — use hostnames (`docker-tower`, `100.101.0.8`)
- Include a "verify before proceeding" checkpoint after destructive steps
- Define all terms used: "healthy" = `docker inspect --format='{{.State.Health.Status}}'` returns `healthy`
- Claude Code CLAUDE.md should include: "When a runbook step is ambiguous, stop and ask — do not infer intent for destructive operations"

**Detection:** Review any runbook instruction containing words like "if needed," "as appropriate," "the server" — each is an ambiguity that must be resolved

**Phase mapping:** Every runbook written in any phase should go through an "AI-readability review" before being considered done

---

### Pitfall 5: Proxmox LXC Configuration Not Captured (Only Container Contents Are)

**What goes wrong:** Docker Compose files for docker-tower are committed, but the LXC configuration itself (CPU allocation, memory limits, network bridge, storage pool, unprivileged/privileged mode, device passthrough) exists only in Proxmox. If tower dies, you know what ran inside LXC 100 but not how the LXC was configured.

**Why it happens:** LXC config feels like "infrastructure" that Proxmox manages, not "application config." It's easy to forget it's also a thing that needs to be reproduced.

**Consequences:** Rebuilding docker-tower requires human memory of the LXC settings. Wrong memory limits or missing device passthrough = broken services even with perfect compose files.

**Prevention:**
- For each LXC, commit the raw config dump: `pct config <vmid>` output stored in repo as `servers/tower/lxcs/<vmid>.conf`
- Document creation command with all flags (not just the resulting config) so it can be reproduced via `pct create`
- Note any Proxmox host-side requirements (storage pools, bridges) that must pre-exist

**Detection:** Do you have `pct config` output for LXCs 100, 101, and 204 committed? If not, you have this gap.

**Phase mapping:** Phase 1 (inventory) must include LXC config capture, not just container contents

---

## Moderate Pitfalls

### Pitfall 6: Tailscale Auth Key Rotation Breaks Automated Rebuilds

**What goes wrong:** Tailscale auth keys (used to join new nodes to the tailnet) expire. A rebuild script that uses a hardcoded or stale auth key fails silently mid-deployment.

**Prevention:**
- Use reusable, tagged auth keys with defined expiry and store the key name (not the value) in the repo
- Runbooks for new server provisioning must include a "generate fresh Tailscale auth key from admin console" step before execution
- Document which Tailscale tag each server should receive so ACL rules apply correctly post-join

**Phase mapping:** Server provisioning runbooks (Phase 2+)

---

### Pitfall 7: Ansible/Script Idempotency Assumed, Not Tested

**What goes wrong:** A provisioning script installs packages and configures a service. Run once: works. Run again to "fix" something: creates duplicate entries, fails on existing resources, or partially re-applies config.

**Why it happens:** Scripts are written for initial setup, not for reruns. The Proxmox community.general Ansible module has known idempotency gaps for certain LXC config changes.

**Prevention:**
- Every script must be tested by running it twice on a clean target — the second run must be a no-op or produce identical output
- Use `apt-get install -y` (idempotent) not `apt-get install` (fails if already installed)
- For Ansible: verify each task has a condition or uses a module that handles existing state

**Phase mapping:** Automation phases — flag each script for "idempotency tested: yes/no"

---

### Pitfall 8: Monitoring Deployed Last, So You Have No Visibility During Setup

**What goes wrong:** Grafana + Prometheus + node-exporter is planned but deprioritized. You spend weeks provisioning services with no visibility into what's actually consuming resources or failing silently.

**Prevention:**
- Deploy node-exporter on all 6 servers in Phase 1 or 2 — it's a single container with no dependencies
- Prometheus + Grafana can come later, but raw metrics should be collected from the start
- Alerts for disk full and container restart loops are more valuable than dashboards during early phases

**Phase mapping:** node-exporter in Phase 1; Prometheus + Grafana in a dedicated monitoring phase before the first "production" service is considered stable

---

### Pitfall 9: nether VPN Config Is a Single Point of Failure With No Documented Recovery

**What goes wrong:** nether is the sole VPN entry/exit point for Netherlands users. AmneziaWG and XRay/VLESS configurations exist on the server but are not in the repo. If nether needs to be rebuilt, VPN access is down until someone remembers the config.

**Prevention:**
- AmneziaWG server config (`/etc/amnezia/` or equivalent) and XRay/VLESS config committed to repo (with secrets stripped — keys referenced, not inlined)
- Client config templates committed so new client configs can be generated
- Document: which port, which protocol, which obfuscation settings

**Phase mapping:** nether documentation is a Phase 1 priority given it's a shared dependency

---

## Minor Pitfalls

### Pitfall 10: README-Driven Structure That Claude Code Can't Navigate

**What goes wrong:** Repo has good documentation in a README but no consistent structure for finding things programmatically. Claude Code has to read multiple files to understand what's on a given server.

**Prevention:**
- Adopt a consistent layout from day 1: `servers/<hostname>/` with predictable files (`services.md`, `compose/`, `scripts/`)
- A single `INVENTORY.md` at root that Claude Code can read to orient itself before any operation

**Phase mapping:** Phase 1 — structure before content

---

### Pitfall 11: Docker Image Tags Left as `latest`

**What goes wrong:** `image: jellyfin/jellyfin:latest` in compose means an update can silently change behavior. After a rebuild, you may get a different version than was running before.

**Prevention:**
- Pin all images to specific versions in committed compose files
- Use a separate "update" runbook that intentionally bumps versions with a changelog note

**Phase mapping:** Enforce during Phase 1 compose file documentation

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| Inventory + Documentation | Missing LXC config (only container contents captured) | Run `pct config` for all LXCs, commit output |
| Inventory + Documentation | nether VPN config not in repo | Prioritize nether config before any other service |
| Compose file documentation | Secrets hardcoded in committed files | Establish secrets pattern before committing any compose file |
| Provisioning scripts | Non-idempotent scripts break on rerun | Test every script by running twice |
| Any phase with runbooks | Ambiguous instructions for Claude Code operator | AI-readability review before marking runbook done |
| Monitoring deployment | Delayed monitoring = blind operations | Deploy node-exporter in Phase 1 |
| Stateful services (Jellyfin, *arr, SQLite) | No backup plan = IaC rebuild loses data | Document backup paths in Phase 1, implement backup before Phase 2 |
| nether VPN rebuild | Tailscale auth key expired | Runbooks must include "generate fresh auth key" step |

---

## Sources

- [4 homelab mistakes I'll never make again in 2026 — XDA Developers](https://www.xda-developers.com/4-homelab-mistakes-ill-never-make-again-in-2026/)
- [Run Your Home Lab with IaC — Virtualization Howto](https://www.virtualizationhowto.com/2025/07/run-your-home-lab-with-infrastructure-as-code-like-a-boss/)
- [Ultimate Home Lab Backup Strategy 2025 — Virtualization Howto](https://www.virtualizationhowto.com/2025/10/ultimate-home-lab-backup-strategy-2025-edition/)
- [Proxmox 8 LXC containers and ansible community.general.proxmox support — Proxmox Forum](https://forum.proxmox.com/threads/proxmox-8-lxc-containers-and-ansible-community-general-proxmox-support.138300/)
- [IaC for Disaster Recovery — ControlMonkey](https://controlmonkey.io/blog/infra-as-code-critical-aspect-for-your-disaster-recovery-plan/)
- [Engineering Pitfalls in AI Coding Tools — arxiv](https://arxiv.org/html/2603.20847)
- [Tailscale ACL Syntax Reference](https://tailscale.com/docs/reference/syntax/policy-file)
