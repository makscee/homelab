# cc-worker

| Field | Value |
|-------|-------|
| Hostname | cc-worker |
| Tailscale IP | 100.99.133.9 |
| Role | Vibe Kanban host, Claude Code runner (operator machine) |
| Hardware | LXC 204 on tower; resource allocation pending SSH query: `nproc && free -h && df -h` |
| Access | `ssh root@cc-worker` via Tailnet (or local shell — this is the operator machine) |

## LXC config

See [../tower/lxc-204-cc-worker.conf](../tower/lxc-204-cc-worker.conf) for fresh Proxmox config pulled 2026-04-14.

## History

2026-04-14: Renamed from cc-vk; new Tailscale IP 100.99.133.9 (was 100.91.54.83). VMID 204 on tower.

## Hosted Services

| Service | Port | Image/Binary | Notes |
|---------|------|-------------|-------|
| Vibe Kanban | Pending SSH query | Pending SSH query | Web-based Kanban board |
| Claude Code | — | claude (CLI) | AI operator; executes all GSD plans from this host |
| SOPS | — | sops binary | Secrets encryption/decryption tool |
| age | — | age binary | Encryption backend for SOPS |
| GSD workflow tools | — | Node.js scripts | Plan execution orchestration |

## Storage Layout

| Path | Purpose | Stateful Data |
|------|---------|--------------|
| ~/.config/sops/age/keys.txt | age private key (CRITICAL) | Decryption key for all SOPS-encrypted secrets |
| ~/hub/workspace/ | Workspace root | All project repos (homelab, voidnet, animaya) |
| ~/hub/workspace/homelab/ | Homelab repo | This repository |
| (Vibe Kanban data pending SSH query) | — | Kanban board state |

## Notes

This is the operator machine. All Claude Code plan execution happens from this server. The age private key at `~/.config/sops/age/keys.txt` is the master decryption key for all SOPS-encrypted secrets across hub repos — loss of this key means loss of access to all encrypted secrets. LXC 204 on tower. The .claude/worktrees/ directory contains parallel agent worktrees for wave execution. If this server fails, no deployments can be executed until an operator machine is rebuilt with the age key restored.
