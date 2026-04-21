---
phase: 20
slug: alerts-panel-rules
status: verified
threats_total: 18
threats_closed: 18
threats_open: 0
asvs_level: 1
created: 2026-04-21
---

# Phase 20 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Aggregates STRIDE threat models from 20-01-PLAN.md, 20-02-PLAN.md, 20-03-PLAN.md.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| browser → /api/alerts/list | Untrusted session cookie; Auth.js v5 session gate | session cookie, alert payloads |
| mcow Next.js → Prometheus (docker-tower:9090) | Tailnet-only HTTP; server-env URL | PromQL queries, alert labels |
| mcow Next.js → Alertmanager (mcow:9093) | Link-out rendered into page; no cross-origin fetch | URL string only |
| Prometheus labels → React JSX render | Exporter-controlled label values (untrusted) | alert labels, severity, instance |
| operator laptop → docker-tower (ansible SSH) | Root config writes over Tailscale + SSH keys | rule YAML, env files |
| Prometheus → Alertmanager (Tailnet HTTP) | Internal alert notifications | alert payloads |
| Alertmanager → Telegram API (public TLS egress from docker-tower) | Bot token auth (file-backed, 0600) | alert text, chat ID |
| git history → production rule file | Commit → ansible deploy pipeline | rule YAML |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-20-01-01 | S (Spoofing) | /api/alerts/list | mitigate | `auth()` gate + 401 on miss — `apps/admin/app/api/alerts/list/route.ts:28-30` | closed |
| T-20-01-02 | T (Tampering) | Severity label → SeverityBadge className | mitigate | Enum-bucket to {critical,warning,info,other} — `apps/admin/lib/alerts-list.server.ts:29,68-69` | closed |
| T-20-01-03 | T (Tampering) | Arbitrary label values in LabelsCell | mitigate | React JSX auto-escaping only; no `dangerouslySetInnerHTML` in `apps/admin/app/(auth)/alerts/_components/LabelsCell.tsx` (grep empty) | closed |
| T-20-01-04 | I (Info disclosure) | PROMETHEUS_URL/ALERTMANAGER_URL leaking to client bundle | mitigate | `import "server-only"` in `apps/admin/lib/alerts-list.server.ts:1`; no `NEXT_PUBLIC_PROMETHEUS`/`NEXT_PUBLIC_ALERTMANAGER` anywhere in apps/admin (grep empty) | closed |
| T-20-01-05 | D (DoS — self) | SWR retry-storm on Prometheus outage | mitigate | Aggregator returns `healthy:false` envelope with HTTP 200 — `alerts-list.server.ts:118`; `refreshInterval: 15_000` fixed — `AlertsTable.tsx:104` | closed |
| T-20-01-06 | E (Elevation) | Unauthed user reaches /alerts RSC | mitigate | `auth()` + `redirect("/login")` — `apps/admin/app/(auth)/alerts/page.tsx:10-11` | closed |
| T-20-01-07 | I (Info) | Prometheus error messages leaked via 500 | mitigate | try/catch in aggregator → generic `healthy:false` envelope — `alerts-list.server.ts` | closed |
| T-20-02-01 | T (Tampering) | Duplicate rules (old + new) firing twice | mitigate | Legacy `ClaudeUsage7dHigh`/`ClaudeUsage7dCritical` removed from `homelab.yml` (grep count = 0); new rules only in `claude-usage.yml` (count = 3) | closed |
| T-20-02-02 | I (Info disclosure) | ALERTMANAGER_URL leaking as `NEXT_PUBLIC_*` | accept | See Accepted Risks AR-01 | closed |
| T-20-02-03 | D (DoS) | Prometheus reload failure on bad YAML | mitigate | `promtool check rules` + `promtool test rules` gate before deploy; test file `claude-usage_test.yml` present | closed |
| T-20-02-04 | E (Elevation) | Ansible playbook running with unintended scope | mitigate | Canonical `ansible/playbooks/deploy-docker-tower.yml` + `deploy-homelab-admin.yml` only; both present | closed |
| T-20-02-05 | R (Repudiation) | Who deployed what when | accept | See Accepted Risks AR-02 | closed |
| T-20-02-06 | I (Info) | Telegram bot token path exposure via rule file | mitigate | `claude-usage.yml` contains no secrets (only the word "Token" in rule descriptions referring to Claude API tokens, not Telegram bot token); token stays at `/etc/alertmanager/telegram_token` mode 0600 | closed |
| T-20-03-01 | D (DoS) | Smoke rule left firing in production | mitigate | `ClaudeUsageSmokeTest` absent from `claude-usage.yml` (grep count = 0); revert commit shipped | closed |
| T-20-03-02 | I (Info disclosure) | Telegram bot token exfiltrated via deploy logs | accept | See Accepted Risks AR-03 | closed |
| T-20-03-03 | S (Spoofing) | Attacker posts fake "smoke-passed" message to chat | accept | See Accepted Risks AR-04 |  closed |
| T-20-03-04 | T (Tampering) | smoke_test label routed to critical receiver | mitigate | Smoke rule used severity=warning (per PLAN + RESEARCH A4); rule now removed — no residual routing exposure | closed |
| T-20-03-05 | R (Repudiation) | No record of smoke window | mitigate | Two git commits (add + remove) + `scripts/smoke-telegram-e2e.sh` (present, executable) + AM README append | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-20-02-02 | `ALERTMANAGER_URL` is a Tailnet-internal URL (`http://mcow:9093`) rendered server-side only in the RSC page; it is not prefixed with `NEXT_PUBLIC_` and is not exposed in the client bundle. URL discovery carries negligible risk given Tailnet ingress-only. | operator | 2026-04-21 |
| AR-02 | T-20-02-05 | Deploy attribution is covered by git history on rule/ansible files plus operator terminal history; no separate audit log required for IaC changes at this phase. | operator | 2026-04-21 |
| AR-03 | T-20-03-02 | Telegram bot token remains in `/etc/alertmanager/telegram_token` (mode 0600); ansible does not echo the token value, only its path. Smoke test touched only rule YAML, which has no secrets. | operator | 2026-04-21 |
| AR-04 | T-20-03-03 | Chat 193835258 is operator-only; Telegram platform auth enforces bot identity. Out-of-band spoofing by third parties not in scope for ASVS L1. | operator | 2026-04-21 |

---

## Unregistered Flags

None. `20-01-SUMMARY.md` and `20-03-SUMMARY.md` did not contain a `## Threat Flags` section; `20-02-SUMMARY.md` explicitly states "None — new surface is limited to additional Prometheus rules and a non-secret env var already defaulted to Tailnet-internal URL." All surface covered by the registered threats above.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-21 | 18 | 18 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-21
