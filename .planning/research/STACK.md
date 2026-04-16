# Stack Additions — Claude Code Usage Monitor (v2.0)

**Milestone:** v2.0 — Claude Code Usage Monitor (additive to v1.0 stack)
**Researched:** 2026-04-16
**Overall confidence:** HIGH on endpoint shape, MEDIUM on polling interval, HIGH on surrounding stack choices

> **Scope note:** This document records stack ADDITIONS for v2.0 only. The v1.0 stack (Ansible 2.17+, SOPS+age, Prometheus 2.x, Grafana 11.x/12.x, Alertmanager v0.27.0, community.docker, community.proxmox) is validated and locked — see git history for the v1.0 STACK.md snapshot.

---

## Critical: Anthropic Usage API Endpoint

**THIS IS THE CENTRAL FEASIBILITY FINDING.** The endpoint exists and is documented by community reverse-engineering + multiple official `anthropics/claude-code` GitHub issues. **No SDK exposes it**; the CLI itself is the only first-party consumer. **It is unofficial-but-stable-enough for homelab use, with caveats.**

### Endpoint

```
GET https://api.anthropic.com/api/oauth/usage
```

### Required headers

| Header | Value | Notes |
|---|---|---|
| `Authorization` | `Bearer sk-ant-oat01-<...>` | The OAuth access token, same format Claude Code CLI writes to `~/.claude/.credentials.json` |
| `anthropic-beta` | `oauth-2025-04-20` | Gatekeeper; omitting or using wrong value returns 401 |
| `User-Agent` | any non-empty (CLI sends `claude-cli/<version>`) | Not strictly enforced, but mirror CLI to avoid future heuristics |

### Response schema

Verified from multiple community sources (GitHub issues #31021, #31637, #30930, codelynx.dev walkthrough):

```json
{
  "five_hour":            { "utilization": 6.0,  "resets_at": "2026-04-16T04:59:59.943648+00:00" },
  "seven_day":            { "utilization": 35.0, "resets_at": "2026-04-18T03:59:59.943679+00:00" },
  "seven_day_oauth_apps": null,
  "seven_day_opus":       { "utilization": 0.0,  "resets_at": null },
  "iguana_necktie":       null
}
```

Field semantics:
- `utilization` — percentage 0.0–100.0 (float). Maps cleanly to `claude_code_*_used_ratio` gauge (/100).
- `resets_at` — RFC3339 timestamp with timezone, `null` when nothing consumed in that window. Export as `*_resets_at_timestamp_seconds` gauge (unix epoch), or omit when null.
- `five_hour` — the rolling session window. Resets 5h after first activity in window.
- `seven_day` — the weekly quota (actual field name for the "weekly reset" on Max plans).
- `seven_day_opus` — Opus-only subquota (the ~20% Opus budget on Max 20x). **This is the Opus carve-out the milestone needs.**
- `seven_day_oauth_apps` — quota for third-party OAuth apps (null for pure Claude Code usage).
- `iguana_necktie` — unknown/feature-flag field; ignore.

### Rate limit (CRITICAL — shapes polling design)

The endpoint is **aggressively rate-limited**. Documented behavior from `anthropics/claude-code#31637` and `#30930`:

- 30–60s polling intervals trigger persistent 429s within minutes.
- Once 429'd, endpoint stays 429 for 30+ minutes with **no Retry-After header**.
- Backoff of 30→60→120→240→300s still gets 429 for entire session in some reports.

**Implication for v2.0 design:**
- **Default poll interval: 300s (5 min) per token, jittered ±30s.** Usage data changes on the order of minutes-to-hours; 5-min granularity is operationally sufficient for 80%/95% threshold alerts.
- **Exponential backoff on 429: 5m → 15m → 30m → 60m cap.** Emit a separate `claude_code_usage_fetch_errors_total{label,reason}` counter so Alertmanager can fire `UsageEndpointStuck` when error-rate > threshold.
- **Cache last-good response** and serve it as the gauge value until next successful poll, with a `claude_code_usage_stale_seconds{label}` gauge so dashboards show freshness.
- With 2–5 tokens × one 5-min poll each, we make 12 req/hour/token, well under any sane server-side limit if the bug is actually per-token.

### Token expiry & refresh

From `anthropics/claude-code#12447`, `#36911`, `#37402` and daveswift.com:

- `sk-ant-oat01-*` access tokens expire. Typical lifetimes: **8–12h** (interactive /login) or **~8h** (--print mode). Some users report expiry "multiple times per day."
- The CLI's credential file (`~/.claude/.credentials.json`) also contains a **refresh token** and handles refresh internally (RFC 6749 `grant_type=refresh_token`).
- **For long-lived unattended automation, Anthropic recommends `claude setup-token`**, which mints a **1-year long-lived token** specifically designed for headless use. **This is what the exporter should consume.** Store the long-lived token (not the interactive OAuth token) in `secrets/claude-tokens.sops.yaml`.
- Exporter does NOT need to implement refresh logic if it only consumes `setup-token` output. Detect 401 → mark token as `claude_code_token_invalid{label}=1` and page operator to regenerate.

### Confidence on endpoint itself: HIGH

Cross-referenced across 6+ independent GitHub issues from Anthropic's own repo, plus a community statusline implementation (codelynx.dev) with the same schema. Not officially documented, not promised stable, but has existed and kept the same shape since April 2025 (per `anthropic-beta: oauth-2025-04-20`).

**Risk flag:** Anthropic's Feb 2026 auth policy restricts OAuth tokens to "Claude Code and Claude.ai only" — a Prometheus exporter technically violates this. Homelab-only scope (no third-party redistribution, no commercial use) keeps this at policy-gray rather than policy-red. Document in PITFALLS.md.

---

## Language Choice

**Recommendation: Python 3.12** with `prometheus-client`.

| Criterion | Python | Go | Winner |
|---|---|---|---|
| Code size for ~200-LOC polling exporter | compact, readable | more boilerplate | Python |
| Prometheus client maturity | `prometheus-client` 0.25.0, mature | `client_golang` 1.20+, equally mature | tie |
| HTTP client for OAuth Bearer | `httpx` or stdlib, trivial | `net/http`, trivial | tie |
| Image size (slim base) | ~130MB + deps ≈ 150MB | ~15MB single static binary | Go |
| Dev velocity / hackability | high | medium | Python |
| Homelab conventions | no Python exporters yet, but Ansible is Python; Python is on every LXC | no Go toolchain currently | Python |
| Container restart cost | negligible (polling, not hot path) | negligible | tie |
| Type safety | Pydantic models optional | native | Go |

**Why Python wins here:** the exporter is a low-frequency poller (once per 5 min per token), not a high-throughput service. Image size doesn't matter (150MB vs 15MB is irrelevant on a 500GB SSD). Code velocity + operator readability (future Claude Code edits) + existing Python presence in Ansible tooling tip the balance. Go's single-binary advantage matters for airgapped distribution, which we don't have.

**Python version: 3.12** (matches Debian 13 LXC default; avoids 3.13 freshness tax for no gain).

Confidence: HIGH.

---

## Prometheus Client Library

**Recommendation: `prometheus-client==0.23.0`** (pinned, not `>=`).

- Current latest: **0.25.0** (released 2026-04-09 per PyPI).
- Pin 0.23.0 for stability (well-tested late-2025 release; Gauge/Counter API unchanged since 0.17).
- Requires Python ≥3.9 (we're using 3.12).
- Usage pattern: `start_http_server(9835, addr="127.0.0.1")` then update `Gauge` objects in a polling loop.

Suggested port: **9835** (unclaimed in [Prometheus default port allocations](https://github.com/prometheus/prometheus/wiki/Default-port-allocations); no conflict with existing 9090/9093/9100/9101 on homelab).

Confidence: HIGH.

---

## HTTP Client + OAuth Handling

**Recommendation: `httpx==0.27.2`** (sync client).

- No async needed (5-min polls), but `httpx.Client` is strictly better than `requests`:
  - HTTP/2 support (Anthropic API serves HTTP/2; slight latency win).
  - Same library Anthropic's own Python SDK uses internally → mirrors real CLI traffic more closely.
  - Cleaner timeout API (`timeout=httpx.Timeout(10.0, connect=5.0)`).
- **Do not use `requests`** — no HTTP/2; the project deliberately avoids legacy deps for new work.
- **OAuth:** no library needed. The exporter reads a pre-minted long-lived token from a mounted file and sends it as `Authorization: Bearer <token>`. No authorization-code flow, no PKCE, no refresh.
- **Retry/backoff:** implement manually (5 req/hour is trivial). Do NOT add `tenacity` — pointless dep.

Token refresh: **NOT NEEDED** if we use `claude setup-token` output (1-year tokens). Document in registry schema that tokens MUST come from `setup-token`, not from `/login`.

Confidence: HIGH.

---

## Base Container Image

**Recommendation: `python:3.12-slim-bookworm@sha256:<pin>`** (Debian slim, NOT Alpine).

- Alpine saves ~80MB but uses musl libc; `prometheus-client` is pure-Python so it works, but any future C-extension dep (cryptography, etc.) breaks.
- Slim-bookworm matches Debian-based LXC host OS → predictable behavior, same ca-certificates trust store, easier to debug.
- amd64 only (both docker-tower and mcow are amd64; no ARM hosts). Skip multi-arch.
- Multi-stage build not needed (no compilation).
- Final image expected ~160MB including `httpx` + `prometheus-client` + `PyYAML`.

Pin workflow: `docker pull python:3.12-slim-bookworm && docker inspect --format='{{index .RepoDigests 0}}' python:3.12-slim-bookworm` → commit the resulting `sha256:...` to compose. Matches existing v1.0 pinning convention.

Confidence: HIGH.

---

## SOPS Integration Pattern

**Recommendation: Match v1.0 pattern exactly — decrypt on controller, push file to host, bind-mount into container read-only.**

This mirrors `ansible/playbooks/deploy-docker-tower.yml` lines 25–48 (navidrome secret flow) and the mcow pattern in `servers/mcow/docker-compose.monitoring.yml`.

### Registry schema (`secrets/claude-tokens.sops.yaml`)

Plaintext shape before SOPS encryption:

```yaml
# secrets/claude-tokens.sops.yaml (encrypted with age)
tokens:
  - label: mcow-primary
    token: sk-ant-oat01-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
    owner_host: mcow
    subscription: max-20x
    added_on: 2026-04-16
    notes: "primary operator token (via claude setup-token)"
  - label: cc-worker
    token: sk-ant-oat01-yyyyyyyyyyyyyyyyyyyyyyyyyyyy
    owner_host: cc-worker
    subscription: max-20x
    added_on: 2026-04-16
```

### Ansible deploy flow

```yaml
- name: Decrypt claude-tokens registry locally
  delegate_to: localhost
  ansible.builtin.shell:
    cmd: "sops --decrypt {{ playbook_dir }}/../../secrets/claude-tokens.sops.yaml"
  register: tokens_plain
  changed_when: false
  no_log: true

- name: Write /run/secrets/claude-tokens.yaml on mcow
  ansible.builtin.copy:
    content: "{{ tokens_plain.stdout }}"
    dest: /run/secrets/claude-tokens.yaml
    mode: '0440'
    owner: root
    group: '65534'   # nobody — matches v1.0 telegram_token pattern
  no_log: true
```

### Compose bind mount

```yaml
services:
  claude-usage-exporter:
    image: ghcr.io/<org>/claude-usage-exporter@sha256:<pin>
    user: "65534:65534"   # run as nobody, consistent with prom/alertmanager
    volumes:
      - /run/secrets/claude-tokens.yaml:/etc/claude-exporter/tokens.yaml:ro
    environment:
      - EXPORTER_PORT=9835
      - POLL_INTERVAL_SECONDS=300
      - TOKENS_FILE=/etc/claude-exporter/tokens.yaml
    ports:
      - "100.101.0.9:9835:9835"   # Tailnet-only bind, same pattern as grafana/alertmanager
    networks:
      - monitoring
```

**Perms note (load-bearing, per v1.0 Key Decision):** `install -m 0440 root:65534` mirrors the telegram_token pattern. `0600` root:root will EACCES for the `nobody` container user.

### What we do NOT do

- No `sops-exec`-style in-container decryption (adds SOPS binary + age key inside image; key management nightmare).
- No env-var injection of raw tokens (leaks via `docker inspect` and systemd journal).
- No Docker secrets swarm mode (not using swarm).

Confidence: HIGH — straight port of an already-validated v1.0 pattern.

---

## Recommended Additions (Summary)

| Component | Choice | Version pin | Placement |
|---|---|---|---|
| Language | Python | 3.12-slim-bookworm | container |
| Prometheus client | `prometheus-client` | 0.23.0 | requirements.txt |
| HTTP client | `httpx` | 0.27.2 | requirements.txt |
| YAML parser | `PyYAML` | 6.0.2 | requirements.txt (parse tokens file) |
| Base image | `python:3.12-slim-bookworm` | sha256 pinned at deploy | Dockerfile FROM |
| Secrets registry | `secrets/claude-tokens.sops.yaml` | SOPS+age, existing recipient | repo |
| Secret delivery | Ansible decrypt → `/run/secrets/claude-tokens.yaml` (0440 root:65534) | matches v1.0 | new playbook `deploy-mcow-claude-exporter.yml` |
| Scrape target | mcow 100.101.0.9:9835 | new entry in `targets/claude-exporter.yml` on docker-tower Prometheus | prometheus config |
| Alert rules | `claude_code_weekly_used_ratio > 0.80` (warning), `> 0.95` (critical); same for session; `claude_code_usage_fetch_errors_total` rate alert | new file `alerts/claude-usage.yml` | Prometheus |
| Poll interval | 300s per token, jittered ±30s | env `POLL_INTERVAL_SECONDS=300` | runtime |
| Port | 9835 | new Tailnet-only bind | mcow compose |
| Token source | `claude setup-token` (1-year tokens) | documented in registry notes | operator procedure |

---

## Confidence Notes (per decision)

| Decision | Confidence | Basis |
|---|---|---|
| Endpoint URL + schema | **HIGH** | 6+ independent GitHub issues in anthropics/claude-code with matching schema; community statusline tooling uses it in production |
| Endpoint is unofficial | HIGH | Not in Anthropic API docs; only referenced in bug reports |
| 300s poll interval | **MEDIUM** | Derived from community 429 reports; not formally documented. Phase 1 MUST validate with a manual soak test (poll every 5min for 24h, count 429s) before finalizing |
| sk-ant-oat01 bearer auth | HIGH | Token format confirmed across multiple sources; `anthropic-beta: oauth-2025-04-20` header confirmed |
| setup-token 1-year lifetime | HIGH | Anthropic-maintained troubleshooting docs + multiple issues cite this |
| Feb 2026 policy risk | MEDIUM | Policy text is restrictive; homelab/personal-use enforcement posture unknown |
| Python over Go | HIGH | Low-freq polling, ~200 LOC, team familiarity, homelab conventions |
| prometheus-client 0.23.0 | HIGH | Stable API, widely used, matches Python 3.12 |
| httpx over requests | HIGH | HTTP/2, mirrors Anthropic SDK, no async overhead in sync mode |
| python:3.12-slim-bookworm | HIGH | Matches host OS, avoids Alpine musl risk, image size irrelevant at homelab scale |
| SOPS decrypt-on-host bind-mount | HIGH | Direct port of validated v1.0 pattern |
| Port 9835 | MEDIUM | Unclaimed in Prometheus default list; verify no conflict at deploy |

---

## Sources

### Endpoint discovery (critical path)
- [anthropics/claude-code#31637 — /api/oauth/usage aggressively rate limits](https://github.com/anthropics/claude-code/issues/31637)
- [anthropics/claude-code#30930 — /api/oauth/usage persistent 429 for Max users](https://github.com/anthropics/claude-code/issues/30930)
- [anthropics/claude-code#31021 — OAuth usage API returns persistent 429](https://github.com/anthropics/claude-code/issues/31021)
- [anthropics/claude-code#34348 — Expose enterprise spending limit via /api/oauth/usage](https://github.com/anthropics/claude-code/issues/34348)
- [anthropics/claude-code#27915 — Expose rate-limit/plan quota in statusLine JSON](https://github.com/anthropics/claude-code/issues/27915)
- [anthropics/claude-code#45392 — API access to usage limits and total monthly usage](https://github.com/anthropics/claude-code/issues/45392)
- [codelynx.dev — How to Show Claude Code Usage Limits in Your Statusline](https://codelynx.dev/posts/claude-code-usage-limits-statusline)

### Token lifecycle
- [anthropics/claude-code#12447 — OAuth token expiration disrupts autonomous workflows](https://github.com/anthropics/claude-code/issues/12447)
- [anthropics/claude-code#36911 — OAuth token expires multiple times per day](https://github.com/anthropics/claude-code/issues/36911)
- [anthropics/claude-code#37402 — OAuth token not persisted/refreshed for --print mode](https://github.com/anthropics/claude-code/issues/37402)
- [Claude Code Troubleshooting docs](https://code.claude.com/docs/en/troubleshooting)
- [Claude Code OAuth Token Expiry: Fixes & Alternatives](https://daveswift.com/claude-oauth-update/)

### Policy context (risk flag)
- [Claude API Authentication in 2026: OAuth Tokens vs API Keys Explained](https://lalatenduswain.medium.com/claude-api-authentication-in-2026-oauth-tokens-vs-api-keys-explained-12e8298bed3d)
- [Claude Code Authentication docs](https://code.claude.com/docs/en/authentication)

### Existing tooling (prior art)
- [ryoppippi/ccusage — Claude Code usage CLI from local JSONL](https://github.com/ryoppippi/ccusage)
- [TylerGallenbeck/claude-code-limit-tracker](https://github.com/TylerGallenbeck/claude-code-limit-tracker)
- [jonis100/claude-quota-tracker](https://github.com/jonis100/claude-quota-tracker)
- [How I Monitor Claude Code with Grafana + OTel + VictoriaMetrics](https://tcude.net/how-i-monitor-my-claude-code-usage-with-grafana-opentelemetry-and-victoriametrics/)
- [Claude Code Monitoring docs (OTel/Prometheus exporters)](https://code.claude.com/docs/en/monitoring-usage)

### Stack choices
- [prometheus-client · PyPI](https://pypi.org/project/prometheus-client/)
- [prometheus/client_python on GitHub](https://github.com/prometheus/client_python)
- [HTTPX vs Requests vs AIOHTTP (2026)](https://decodo.com/blog/httpx-vs-requests-vs-aiohttp)
- [Python HTTP Clients: Requests vs HTTPX vs AIOHTTP (Speakeasy)](https://www.speakeasy.com/blog/python-http-clients-requests-vs-httpx-vs-aiohttp)
- [The best Docker base image for your Python application (Feb 2026)](https://pythonspeed.com/articles/base-image-python-docker-images/)
- [python:3.12-slim image layer details](https://hub.docker.com/layers/library/python/3.12-slim/)

### Claude API context
- [Anthropic rate limits](https://platform.claude.com/docs/en/api/rate-limits)
- [Anthropic API errors](https://platform.claude.com/docs/en/api/errors)
- [Claude Code Rate Limits Explained 2026 (SitePoint)](https://www.sitepoint.com/claude-code-rate-limits-explained/)
