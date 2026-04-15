# Phase 04: Operator Dashboard — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-15
**Phase:** 04-operator-dashboard
**Areas discussed:** Overview layout, Home dashboard choice, Grafana migration path, Alertmanager location, Alert panel source, Alert smoke test method, animaya-dev handling

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Overview layout | Single-page dashboard structure | ✓ |
| Grafana migration path | SQLite preserve vs clean install | ✓ |
| Home dashboard choice | New Operator Overview vs extend Homelab Summary | ✓ |
| Alert smoke test method | Synthetic via amtool vs natural trigger | ✓ |
| Alertmanager co-locate | Stay on docker-tower vs move to mcow | ✓ |
| animaya-dev in overview | Include with no data vs exclude | ✓ |
| Alertmanager panel source | AM datasource vs Prometheus ALERTS | ✓ |
| None — proceed | Skip extras | |

---

## Overview layout

| Option | Description | Selected |
|--------|-------------|----------|
| Row per host | 6 symmetric rows, one per host, scrollable | |
| KPI strip + detail | Top status strip + per-host detail panels below | ✓ |
| Grid tiles | 6 uniform compact tiles, all visible | |

**User's choice:** KPI strip + detail
**Notes:** User selected the ASCII preview showing status strip (6 host pills + alerts count + total containers) above per-host detail rows with cpu/ram/disk panels.

---

## Home dashboard choice

| Option | Description | Selected |
|--------|-------------|----------|
| New 'Operator Overview' | Purpose-built; keep Homelab Summary as secondary | ✓ |
| Extend Homelab Summary | Add panels, set as home — single source | |

**User's choice:** New 'Operator Overview'
**Notes:** Clean separation between at-a-glance overview and detail view.

---

## Grafana migration path

| Option | Description | Selected |
|--------|-------------|----------|
| Clean install on mcow | Fresh Grafana; provisioning re-applies; SQLite empty | ✓ |
| Copy SQLite DB | Rsync grafana.db; preserve UIDs/history/prefs | |
| Clean + pre-seed datasource UID | Fresh install, pin datasource UID in provisioning | |

**User's choice:** Clean install on mcow
**Notes:** Dashboards-as-code is source of truth; no user prefs in use worth preserving. Datasource UID pinning still applied (taken from option 3 as implementation hygiene, not the primary choice).

---

## Alertmanager location (co-locate)

| Option | Description | Selected |
|--------|-------------|----------|
| Stay on docker-tower | Only Grafana moves; minimal blast radius | |
| Move to mcow with Grafana | All operator-facing stack on mcow | ✓ |

**User's choice:** Move to mcow with Grafana
**Notes:** Cleaner conceptual split — docker-tower = data plane (Prometheus), mcow = operator plane (Grafana + Alertmanager). Requires Telegram secret re-deploy on mcow (0440 root:65534 recipe from 03-05).

---

## Alertmanager panel source

| Option | Description | Selected |
|--------|-------------|----------|
| Alertmanager datasource | Grafana AM datasource queries /api/v2/alerts | ✓ |
| Prometheus ALERTS metric | Scrape-interval snapshot; no extra datasource | |

**User's choice:** Alertmanager datasource
**Notes:** Accurate real-time firing state; respects silences/inhibits; matches what fires Telegram.

---

## Alert smoke test method

| Option | Description | Selected |
|--------|-------------|----------|
| Natural trigger (stop node-exporter) | SSH host, stop node-exporter, watch fire + resolve | ✓ |
| Synthetic via amtool | Inject alert via AM v2 API; fast, bypasses Prometheus | |
| Both (natural + synthetic for regression) | Natural in UAT, synthetic script for regression | |

**User's choice:** Natural trigger
**Notes:** Most authentic signal — proves full path scrape-gap → rule eval → AM → Telegram. cc-worker suggested as safe target host.

---

## animaya-dev handling

**First question options:**

| Option | Description | Selected |
|--------|-------------|----------|
| Include with 'no data' | Visible gap; operator sees unfixed hole | (initial recommendation) |
| Exclude until SSH fixed | Hide until unblocked | |
| Include + annotate blocker | 'no data' + panel text pointing to 03-02 SUMMARY | |

**User's response:** "what is wrong with ssh there? can we fix it now?"

**Clarification provided:** No authorized SSH key on LXC for root/admin; Tailscale reach fine. Fix path via `pct exec` from tower (Proxmox host) bypasses SSH, then re-run existing ansible playbook. ~10 min effort.

**Follow-up question — fold fix into Phase 04?**

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — new plan 04-04 | Push SSH key via pct exec; re-run node-exporter playbook; flip deferred flag | ✓ |
| No — separate quick task | Handle post-phase via /gsd-quick; overview shows 'no data' | |
| No — exclude animaya entirely | Dashboard shows 5 hosts only | |

**User's choice:** Yes — new plan 04-04
**Notes:** Closes real v1.0 gap flagged in milestone audit. Phase plan count expands 3 → 4. animaya included in overview; renders live once 04-04 completes.

---

## Closing

| Option | Description | Selected |
|--------|-------------|----------|
| Create context | Write CONTEXT.md + DISCUSSION-LOG.md, commit, advance | ✓ |
| Explore more gray areas | Surface additional gray areas | |

**User's choice:** Create context

---

## Claude's Discretion

Logged in CONTEXT.md. Summary:
- Grafana version pin (match current digest unless CVE)
- Panel visual thresholds (gauge colors)
- Panel ordering within detail rows
- File layout under `servers/mcow/monitoring/`
- SOPS secret filename on mcow
- cAdvisor label-matching regex

## Deferred Ideas

Logged in CONTEXT.md `<deferred>`. Summary:
- SQLite DB migration (annotations, user prefs) — skipped
- Alertmanager HA — out of scope for v1.0
- Cert expiry exporter — next milestone
- nether secrets cleanup — tidy-up, not a Phase 04 blocker
- Blackbox HTTP probing — discretion, skip unless requested
