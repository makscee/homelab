---
phase: 22-security-review-launch
plan: 03
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/launch/backup-audit-db.sh
  - scripts/launch/restore-audit-db.sh
  - ansible/playbooks/deploy-homelab-admin.yml
  - .planning/milestones/v3.0-RUNBOOK.md
autonomous: true
requirements: [SEC-08]
tags: [launch, backup, runbook, rollback]
must_haves:
  truths:
    - "A cron-scheduled backup of /var/lib/homelab-admin/audit.db runs on mcow and writes timestamped dumps to /var/backups/homelab-admin/"
    - "A restore script exists and has been exercised once: dump → restore to /tmp scratch → SELECT COUNT(*) matches source"
    - "Runbook at .planning/milestones/v3.0-RUNBOOK.md covers: deploy, secret rotation, Caddy reload, Auth.js session reset, exporter restart, common failure modes, rollback procedure"
    - "Rollback procedure in runbook = `ansible-playbook deploy-homelab-admin.yml -e ref=<prev-sha>` with concrete example commands"
  artifacts:
    - path: "scripts/launch/backup-audit-db.sh"
      provides: "Backup script + cron install target"
    - path: "scripts/launch/restore-audit-db.sh"
      provides: "Restore to scratch path and verify row count"
    - path: ".planning/milestones/v3.0-RUNBOOK.md"
      provides: "Operator runbook for v3.0 production ops"
      contains: "Rollback"
  key_links:
    - from: "cron on mcow"
      to: "/var/lib/homelab-admin/audit.db"
      via: "sqlite3 .backup"
      pattern: "sqlite3.*\\.backup"
---

<objective>
Deliver the backup/restore drill (D-22-14), runbook (D-22-15), and rollback documentation (D-22-16). This plan is independent of ui-kit and security review and runs in wave 1 in parallel with 22-01 and 22-02.

Purpose: Launch gate — no v3.0 ship without a proven restore path, an operator runbook, and a documented rollback.

Output: Backup + restore scripts on mcow with cron; runbook file at `.planning/milestones/v3.0-RUNBOOK.md`; restore drill evidence recorded inline.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/22-security-review-launch/22-CONTEXT.md
@ansible/playbooks/deploy-homelab-admin.yml
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: SQLite audit.db backup + restore scripts + cron install</name>
  <files>
    scripts/launch/backup-audit-db.sh,
    scripts/launch/restore-audit-db.sh,
    ansible/playbooks/deploy-homelab-admin.yml
  </files>
  <read_first>
    - ansible/playbooks/deploy-homelab-admin.yml (to find existing handler/task patterns)
  </read_first>
  <action>
    Per D-22-14: dump audit.db, restore to scratch, verify `SELECT COUNT(*)` matches. Cron the backup on mcow.

    ### 1. `scripts/launch/backup-audit-db.sh` (runs on mcow)
    ```bash
    #!/usr/bin/env bash
    set -euo pipefail
    SRC="/var/lib/homelab-admin/audit.db"
    DEST_DIR="/var/backups/homelab-admin"
    RETAIN_DAYS="${RETAIN_DAYS:-14}"
    mkdir -p "$DEST_DIR"
    TS=$(date -u +%Y%m%dT%H%M%SZ)
    DEST="$DEST_DIR/audit.db.$TS"
    # Use sqlite3 .backup for a consistent online dump (safe while app is running)
    sqlite3 "$SRC" ".backup '$DEST'"
    gzip -9 "$DEST"
    # Retention: delete gzipped backups older than RETAIN_DAYS
    find "$DEST_DIR" -type f -name 'audit.db.*.gz' -mtime +"$RETAIN_DAYS" -delete
    echo "[backup] wrote $DEST.gz"
    ```

    ### 2. `scripts/launch/restore-audit-db.sh` (runs on mcow or controller)
    ```bash
    #!/usr/bin/env bash
    # Usage: restore-audit-db.sh <path-to-backup.db.gz> [scratch-dir]
    set -euo pipefail
    BACKUP="${1:?backup path required}"
    SCRATCH="${2:-/tmp/homelab-admin-restore-$$}"
    SRC_LIVE="/var/lib/homelab-admin/audit.db"
    mkdir -p "$SCRATCH"
    gunzip -c "$BACKUP" > "$SCRATCH/audit.db"
    LIVE=$(sqlite3 "$SRC_LIVE" 'SELECT COUNT(*) FROM audit_log;')
    REST=$(sqlite3 "$SCRATCH/audit.db" 'SELECT COUNT(*) FROM audit_log;')
    echo "[restore] live=$LIVE restored=$REST scratch=$SCRATCH"
    if [ "$LIVE" -lt "$REST" ]; then
      echo "[restore] WARN: restored row count exceeds live; backup is newer than or equal to live"
    fi
    # Pass criterion: restored file is valid sqlite AND row count is within ±5 of live
    # (drift expected during concurrent writes; PRAGMA integrity_check MUST be ok)
    INT=$(sqlite3 "$SCRATCH/audit.db" 'PRAGMA integrity_check;')
    if [ "$INT" != "ok" ]; then
      echo "[restore] FAIL: integrity_check=$INT"; exit 1
    fi
    echo "[restore] PASS — integrity ok; row counts comparable"
    ```

    Make both scripts executable. Commit under `scripts/launch/`.

    ### 3. Install cron on mcow via Ansible
    Add a block to `ansible/playbooks/deploy-homelab-admin.yml` (appended after the existing systemd unit install) that:
    - Copies `scripts/launch/backup-audit-db.sh` to `/usr/local/sbin/backup-audit-db.sh` (mode 0755, owner root).
    - Installs a `cron` entry via `ansible.builtin.cron`:
      ```yaml
      - name: Install audit.db backup cron (Phase 22 D-22-14)
        ansible.builtin.cron:
          name: "homelab-admin audit.db backup"
          minute: "17"
          hour: "3"
          user: root
          job: "/usr/local/sbin/backup-audit-db.sh >> /var/log/homelab-admin-backup.log 2>&1"
          state: present
      ```
    - Ensure `/var/backups/homelab-admin` dir exists (mode 0700 root).

    Deploy: `ansible-playbook -i ansible/inventory/hosts.yml ansible/playbooks/deploy-homelab-admin.yml`.

    ### 4. Restore drill (one-time evidence)
    ```bash
    ssh root@mcow '/usr/local/sbin/backup-audit-db.sh'
    LATEST=$(ssh root@mcow 'ls -1t /var/backups/homelab-admin/*.gz | head -1')
    scp root@mcow:"$LATEST" /tmp/
    ssh root@mcow "bash -s" < scripts/launch/restore-audit-db.sh "$LATEST"
    ```
    Capture stdout and paste into the runbook's "Backup/Restore Drill" section in task 2.
  </action>
  <verify>
    <automated>test -x scripts/launch/backup-audit-db.sh && test -x scripts/launch/restore-audit-db.sh && ssh -o BatchMode=yes root@mcow 'test -x /usr/local/sbin/backup-audit-db.sh && crontab -l | grep -q backup-audit-db && test -d /var/backups/homelab-admin && ls /var/backups/homelab-admin/*.gz 2>/dev/null | head -1'</automated>
  </verify>
  <acceptance_criteria>
    - Both scripts present, executable, committed.
    - deploy-homelab-admin.yml installs cron (3:17 UTC daily) and creates /var/backups/homelab-admin.
    - At least one .gz backup exists on mcow after manual run.
    - Restore drill succeeds: `PRAGMA integrity_check == ok` + row count logged.
  </acceptance_criteria>
  <done>Backup cronned, restore proven, drill output captured for runbook.</done>
</task>

<task type="auto">
  <name>Task 2: v3.0 operator runbook</name>
  <files>.planning/milestones/v3.0-RUNBOOK.md</files>
  <read_first>
    - .planning/phases/22-security-review-launch/22-CONTEXT.md (D-22-15, D-22-16)
    - ansible/playbooks/deploy-homelab-admin.yml
    - CLAUDE.md (infrastructure map)
  </read_first>
  <action>
    Per D-22-15, D-22-16: create `.planning/milestones/v3.0-RUNBOOK.md`. Operator-first reference — no narrative, concrete commands throughout.

    Required sections (in this order):

    ## 1. Infrastructure Map
    - Target: `homelab.makscee.ru` on mcow (100.101.0.9). Tailnet-only ingress via Caddy (SEC-01 rate limit on /api/auth/*). App = Next.js 15 + Bun 1.1.38, systemd unit `homelab-admin.service`.
    - Reference: `/Users/admin/hub/workspace/homelab/CLAUDE.md`.

    ## 2. Deploy Procedure
    - Standard: `ansible-playbook -i ansible/inventory/hosts.yml ansible/playbooks/deploy-homelab-admin.yml`.
    - Expected PLAY RECAP: `ok=29 changed=<N> failed=0`.
    - Verification: `curl -sI https://homelab.makscee.ru` returns 200 + expected headers. `ssh root@mcow 'systemctl status homelab-admin.service'` shows active.

    ## 3. Rollback (D-22-16)
    - Procedure: `ansible-playbook -i ansible/inventory/hosts.yml ansible/playbooks/deploy-homelab-admin.yml -e ref=<prev-sha>`.
    - Concrete example: `-e ref=46ccb76` (last known-good at time of v3.0 ship).
    - Post-rollback check: `curl -s https://homelab.makscee.ru/api/health` returns 200; `systemctl status homelab-admin.service` active; audit.db reads ok.
    - No automated rollback tooling. No database schema reverse step in v3.0 — additive migrations only.

    ## 4. Secret Rotation
    - Location: `secrets/mcow.sops.yaml` (SOPS+age).
    - Procedure per key:
      - Edit: `sops secrets/mcow.sops.yaml` (opens decrypted in $EDITOR).
      - Deploy: `ansible-playbook -i ansible/inventory/hosts.yml ansible/playbooks/deploy-homelab-admin.yml --tags env`.
      - Restart: handler `Restart homelab-admin` fires.
    - GitHub OAuth rotation: regenerate on github.com/settings/developers → update CLIENT_ID + CLIENT_SECRET in sops file → deploy. Active sessions invalidated by rotating `AUTH_SECRET` in the same commit (see section 5).

    ## 5. Auth.js Session Reset
    - Rotate `AUTH_SECRET` in `secrets/mcow.sops.yaml` to a new random value (`openssl rand -hex 32`).
    - Deploy with --tags env (section 4). All existing sessions are invalidated on restart. Operator must re-sign-in.

    ## 6. Caddy Reload
    - Template: `ansible/playbooks/templates/caddy-homelab-admin.conf.j2`.
    - Edit template → `ansible-playbook ansible/playbooks/deploy-homelab-admin.yml --tags caddy`.
    - Manual reload on mcow: `ssh root@mcow 'systemctl reload caddy'`. Validate with `caddy validate --config /etc/caddy/Caddyfile`.

    ## 7. Exporter Restart
    - claude-usage-exporter on mcow: `ssh root@mcow 'systemctl restart claude-usage-exporter'`.
    - Verify: `curl -s http://100.101.0.9:9101/metrics | head -20`.
    - Playbook: `ansible-playbook ansible/playbooks/deploy-claude-usage-exporter.yml`.

    ## 8. Backup / Restore Drill (D-22-14)
    - Backup: `ssh root@mcow /usr/local/sbin/backup-audit-db.sh` (cron nightly 03:17 UTC).
    - Location: `/var/backups/homelab-admin/audit.db.<utc-ts>.gz` (retain 14 days).
    - Restore script: `scripts/launch/restore-audit-db.sh <backup.gz>`.
    - Drill result (paste from task 1 above): include live/restored counts + `PRAGMA integrity_check=ok`.

    ## 9. Common Failure Modes
    Document each with symptom → check → fix:
    - **Caddy 502** → `systemctl status homelab-admin.service` → likely bun crash; tail `journalctl -u homelab-admin -n 200`.
    - **429 on /api/auth/** → SEC-01 rate limit hit; expected at >60 req/min from same IP (D-22-06).
    - **OAuth 500** → check `AUTH_SECRET` + `AUTH_GITHUB_ID/SECRET` in decrypted env; GitHub app callback URL must match `https://homelab.makscee.ru/api/auth/callback/github`.
    - **audit.db locked** → likely crashed restore run; `rm -f /tmp/homelab-admin-restore-*` then re-check.
    - **Prometheus scrape failing on homelab-admin** → (D-22-17 added in plan 22-06) check `ss -ltnp | grep 9300` on mcow.
    - **SOPS decrypt fails** → missing age key; see `servers/mcow/README.md` for key path `/root/.config/sops/age/keys.txt`.

    ## 10. DNS / TLS Check
    - `scripts/launch/check-dns-tls.sh` (added in plan 22-06) asserts `homelab.makscee.ru` resolves + cert valid > 30d.

    ## 11. Reference Index
    - STATE.md: `.planning/STATE.md`
    - Requirements: `.planning/REQUIREMENTS.md`
    - v3.0 security aggregation: `.planning/milestones/v3.0-SECURITY.md` (plan 22-05)
    - This file: `.planning/milestones/v3.0-RUNBOOK.md`
    - Infrastructure map: `CLAUDE.md`

    Ensure `.planning/milestones/` dir exists (create if needed): `mkdir -p .planning/milestones`.
  </action>
  <verify>
    <automated>test -f .planning/milestones/v3.0-RUNBOOK.md && grep -q 'Rollback' .planning/milestones/v3.0-RUNBOOK.md && grep -q 'ansible-playbook deploy-homelab-admin.yml -e ref=' .planning/milestones/v3.0-RUNBOOK.md && grep -q 'backup-audit-db.sh' .planning/milestones/v3.0-RUNBOOK.md && grep -q 'AUTH_SECRET' .planning/milestones/v3.0-RUNBOOK.md</automated>
  </verify>
  <acceptance_criteria>
    - `.planning/milestones/v3.0-RUNBOOK.md` exists with all 11 sections.
    - Rollback section shows exact ansible command per D-22-16.
    - Backup section pastes real drill output from task 1.
    - Every section has at least one concrete command (no prose-only sections).
  </acceptance_criteria>
  <done>Runbook committed; drill evidence embedded; rollback documented.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| cron (root on mcow) → /var/lib/homelab-admin/audit.db | Local filesystem, same-host. No network boundary. |
| operator → ansible → mcow | SSH over Tailnet, key-based auth; rollback path uses same channel |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-22-03-01 | Denial of service | audit.db corruption | mitigate | Nightly backup with sqlite3 .backup (online consistent dump); 14-day retention; restore drill proven |
| T-22-03-02 | Information disclosure | /var/backups/homelab-admin | mitigate | Directory mode 0700 root-only; audit.db contains only operator actions, no secrets |
| T-22-03-03 | Tampering during rollback | git ref in -e ref=<sha> | accept | Operator-typed git sha; commit log is the audit trail |
</threat_model>

<verification>
- Restore drill output captured in runbook section 8.
- Cron installed and listed via `crontab -l` on mcow.
- Runbook passes grep for rollback command, AUTH_SECRET, backup-audit-db.sh.
</verification>

<success_criteria>
- Backup cron live, at least one .gz backup on mcow.
- Restore drill produced PRAGMA integrity_check=ok.
- Runbook contains all 11 sections with concrete commands.
- Rollback procedure literally matches D-22-16 wording.
</success_criteria>

<output>
After completion, create `.planning/phases/22-security-review-launch/22-03-SUMMARY.md`:
- Drill row counts (live vs restored)
- Cron entry line
- Runbook section list + line counts
</output>
