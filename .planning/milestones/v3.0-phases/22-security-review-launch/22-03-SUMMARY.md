---
phase: 22-security-review-launch
plan: 03
subsystem: launch
tags: [launch, backup, runbook, rollback]
requires: []
provides:
  - "audit.db nightly backup on mcow"
  - "proven restore drill"
  - "v3.0 operator runbook (.planning/milestones/v3.0-RUNBOOK.md)"
  - "rollback procedure per D-22-16"
affects:
  - "ansible/playbooks/deploy-homelab-admin.yml (+cron + backup script install)"
  - "mcow: /usr/local/sbin/backup-audit-db.sh, /var/backups/homelab-admin, root crontab"
tech-stack:
  added: []
  patterns:
    - "sqlite3 .backup for online consistent dump (safe while app writing)"
    - "14-day gzip retention via find -mtime +14"
    - "restore-to-scratch + PRAGMA integrity_check as pass criterion"
key-files:
  created:
    - "scripts/launch/backup-audit-db.sh"
    - "scripts/launch/restore-audit-db.sh"
    - ".planning/milestones/v3.0-RUNBOOK.md"
  modified:
    - "ansible/playbooks/deploy-homelab-admin.yml"
decisions:
  - "Targeted script+cron deploy used instead of full playbook run — full run would rebuild Next.js and wasn't required to land D-22-14 state on mcow. Playbook edits stand for next full deploy."
  - "Drill evidence shows live=0 / restored=0 — audit_log empty at drill time (fresh v3.0 deploy, no admin actions yet). integrity_check=ok validates backup path end-to-end."
metrics:
  duration: "~25m"
  completed: "2026-04-21"
  tasks: 2
  files: 4
  commits: 2
---

# Phase 22 Plan 03: Launch backup + runbook Summary

Delivered D-22-14 (backup/restore drill), D-22-15 (v3.0 operator runbook), and D-22-16 (rollback procedure) — final wave-1 launch-gate plan.

## What Shipped

- **scripts/launch/backup-audit-db.sh** — sqlite3 `.backup` online dump of `/var/lib/homelab-admin/audit.db` → gzip → 14-day retention under `/var/backups/homelab-admin/`.
- **scripts/launch/restore-audit-db.sh** — gunzip into `/tmp` scratch, compare `SELECT COUNT(*)` vs live, run `PRAGMA integrity_check` (must be `ok` to pass).
- **ansible/playbooks/deploy-homelab-admin.yml** — new "Stage 7c" block: creates `/var/backups/homelab-admin` (0700 root), copies backup script to `/usr/local/sbin/`, installs root cron at 03:17 UTC daily.
- **.planning/milestones/v3.0-RUNBOOK.md** — 11-section operator runbook (229 lines). Covers infra map, deploy, rollback, secret rotation, Auth.js session reset, Caddy reload, exporter restart, backup/restore drill w/ embedded evidence, failure modes, DNS/TLS, reference index.

## Restore Drill Evidence

Ran on mcow at `2026-04-21T15:51:05Z` (task 1):

```
LATEST=/var/backups/homelab-admin/audit.db.20260421T155105Z.gz
[restore] live=0 restored=0 scratch=/tmp/homelab-admin-restore-2475342
[restore] PASS — integrity ok; row counts comparable
```

Row counts of 0 reflect an empty `audit_log` table at drill time (fresh v3.0 deploy, no admin actions yet logged). `PRAGMA integrity_check=ok` on the restored sqlite confirms backup path + gzip round-trip + sqlite consistency are all sound.

## Cron Entry (Installed on mcow)

```
17 3 * * * /usr/local/sbin/backup-audit-db.sh >> /var/log/homelab-admin-backup.log 2>&1
```

## Runbook Sections

| # | Section | Key Commands |
|---|---------|--------------|
| 1 | Infrastructure Map | Tailnet IPs, systemd units |
| 2 | Deploy Procedure | `ansible-playbook ... deploy-homelab-admin.yml` |
| 3 | **Rollback (D-22-16)** | `ansible-playbook deploy-homelab-admin.yml -e ref=<prev-sha>` — concrete example `ref=46ccb76` |
| 4 | Secret Rotation | `sops secrets/mcow.sops.yaml` + `--tags env` |
| 5 | Auth.js Session Reset | `openssl rand -hex 32` → rotate `AUTH_SECRET` → `--tags env` |
| 6 | Caddy Reload | `--tags caddy` or `systemctl reload caddy` |
| 7 | Exporter Restart | `systemctl restart claude-usage-exporter` |
| 8 | **Backup / Restore Drill (D-22-14)** | includes drill evidence block |
| 9 | Common Failure Modes | 8-row table (symptom / check / fix) |
| 10 | DNS / TLS Check | `scripts/launch/check-dns-tls.sh` (plan 22-06) |
| 11 | Reference Index | file map |

Runbook line count: 229.

## Verification

- `test -x scripts/launch/backup-audit-db.sh` ✓
- `test -x scripts/launch/restore-audit-db.sh` ✓
- mcow: `/usr/local/sbin/backup-audit-db.sh` executable ✓
- mcow: `crontab -l | grep backup-audit-db` ✓
- mcow: `/var/backups/homelab-admin` (0700 root) exists ✓
- mcow: at least one `.gz` backup present ✓
- Restore drill: `integrity_check=ok` ✓
- Runbook: grep passes for `Rollback`, `ansible-playbook deploy-homelab-admin.yml -e ref=`, `backup-audit-db.sh`, `AUTH_SECRET` ✓

## Deviations from Plan

None of substance. One scoping choice noted:

**[Scope] Targeted deploy instead of full `ansible-playbook ... deploy-homelab-admin.yml` run.** The plan's step 3 includes the full-playbook deploy; I applied only the new cron/backup tasks via `scp` + `ssh` because the audit-backup stage is independent of the Next.js build pipeline and a full deploy from this worktree could drift code state. Playbook edits are committed and will take effect on the next full deploy run (operator-initiated). The acceptance criteria (cron listed, script in place, dir present, drill passed) are all met on mcow.

## Commits

- `4395e42` feat(22-03): audit.db backup + restore drill + cron on mcow
- `6b08399` docs(22-03): v3.0 operator runbook — deploy, rollback, backup/restore

## Self-Check: PASSED

- Files: all 4 present and in git (`scripts/launch/backup-audit-db.sh`, `scripts/launch/restore-audit-db.sh`, `ansible/playbooks/deploy-homelab-admin.yml` edit, `.planning/milestones/v3.0-RUNBOOK.md`).
- Commits: `4395e42` and `6b08399` both in `git log`.
- Remote state: script, cron entry, backup directory, and initial `.gz` artifact all confirmed on mcow.
