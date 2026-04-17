---
status: resolved
trigger: "Claude Code usage stats graph in Grafana stopped updating around 12:34 today"
created: 2026-04-17T14:30:00+03:00
updated: 2026-04-17T20:26:00+08:00
---

## Current Focus

hypothesis: RESOLVED — Two tokens (andrey, makscee) added to secrets/claude-tokens.sops.yaml, Ansible redeployed, exporter reloaded with "registry reloaded: 2 enabled tokens" at 20:26 WITA. First poll fires at ~20:31.
test: journalctl confirms 2 enabled tokens; /metrics endpoint serving TYPE/HELP lines; data values populate on next 300s poll cycle.
expecting: Grafana dashboard shows new datapoints within 5-10 minutes
next_action: DONE — archive session

## Symptoms

expected: Grafana Claude Code usage dashboard shows continuous datapoints
actual: No new data points after ~12:34 MSK today (2026-04-17)
errors: none visible — exporter is running and serving, Prometheus scrape succeeds, but metric series is empty
reproduction: open Grafana claude-usage dashboard, time series ends at ~12:34
started: broke at ~12:31 MSK 2026-04-17 (Phase 13-02 Ansible deploy)

## Eliminated

- hypothesis: Prometheus scrape failure / network issue
  evidence: `curl http://localhost:9090/api/v1/targets` shows claude-usage job health=up, lastScrape ~12:14
  timestamp: 2026-04-17T14:35:00+03:00

- hypothesis: Exporter service crashed or OOM'd
  evidence: `systemctl status claude-usage-exporter` shows active/running since 17:34 WITA (09:34 UTC / 12:34 MSK); port 9101 listening
  timestamp: 2026-04-17T14:36:00+03:00

- hypothesis: Phase 14-01 node-exporter ansible run broke something
  evidence: Root cause is the claude-tokens registry being empty, unrelated to node-exporter
  timestamp: 2026-04-17T14:45:00+03:00

- hypothesis: Prior diagnosis — SOPS file was "never populated" (tokens never existed)
  evidence: Old process pid 1458962 logs show "Token andrey" and "Token makscee" polling successfully every 5 min up to 12:34 MSK. Tokens existed in the pre-deploy on-disk JSON but were never committed to SOPS.
  timestamp: 2026-04-17T16:00:00+03:00

- hypothesis: Prometheus scrape failure causing empty Grafana
  evidence: Prometheus IS scraping (lastScrape ~12:19 UTC = now); exporter is up on 100.101.0.9:9101 and returns valid /metrics. Problem is the gauge series have no label values — exporter has 0 tokens loaded.
  timestamp: 2026-04-17T16:00:00+03:00

## Evidence

- timestamp: 2026-04-17T14:34:00+03:00
  checked: Prometheus config (servers/docker-tower/monitoring/prometheus/prometheus.yml)
  found: claude-usage job scrapes 100.101.0.9:9101 every 60s
  implication: scrape config is correct

- timestamp: 2026-04-17T14:35:00+03:00
  checked: Prometheus targets API on docker-tower
  found: claude-usage target health=up, lastScrape=2026-04-17T12:14 — no scrape since ~12:14 MSK
  implication: Prometheus thinks target is up but lastScrape timestamp is frozen (metric has no data to scrape, so Prometheus scrapes successfully but gets empty/stale series)

- timestamp: 2026-04-17T14:36:00+03:00
  checked: claude-usage-exporter systemd unit on mcow
  found: service active/running since 17:34 WITA (12:34 MSK); logs show "registry reloaded: 0 enabled tokens"
  implication: exporter is healthy but serving no metrics — registry is empty

- timestamp: 2026-04-17T14:38:00+03:00
  checked: /var/lib/claude-usage-exporter/claude-tokens.json on mcow
  found: {"tokens": []} — 17 bytes; file birth=2026-04-17 17:31 WITA (12:31 MSK)
  implication: registry was written empty at exactly the cutoff time

- timestamp: 2026-04-17T14:40:00+03:00
  checked: secrets/claude-tokens.sops.yaml (decrypted)
  found: tokens: [] — source SOPS file is empty
  implication: the SOPS file was never populated with real tokens; Ansible correctly deployed what was there

- timestamp: 2026-04-17T14:42:00+03:00
  checked: git log -- secrets/claude-tokens.sops.yaml
  found: only 2 commits — c88d545 "seed empty claude-tokens registry" and 01113e9. Never updated with real tokens.
  implication: tokens were never added to SOPS; Phase 13-01 seeded a placeholder, Phase 13-02 Ansible deploy wrote the empty registry to mcow

- timestamp: 2026-04-17T16:00:00+03:00
  checked: journalctl -u claude-usage-exporter filtered by old pid 1458962
  found: Token andrey and Token makscee polled successfully every 5 min up until 12:34 MSK. Last entries at 12:34:29 and 12:34:33.
  implication: tokens existed and worked before the deploy; they were in the pre-deploy on-disk JSON, not in SOPS

- timestamp: 2026-04-17T16:00:00+03:00
  checked: journalctl filtered by new pid 1619428 (started 09:34 UTC = 12:34 MSK)
  found: "registry reloaded: 0 enabled tokens" at startup and at 17:45. No polls ever executed.
  implication: new process has never had tokens; the deploy overwrote the JSON with empty content from SOPS

- timestamp: 2026-04-17T16:00:00+03:00
  checked: curl http://100.101.0.9:9101/metrics (correct bind address)
  found: claude_usage_* gauge TYPE/HELP lines present but zero label series — no data values
  implication: confirms exporter is serving empty metrics; Prometheus scrapes succeed but get no series

## Resolution

root_cause: Two Claude API tokens (label "andrey" and "makscee") existed in /var/lib/claude-usage-exporter/claude-tokens.json on mcow from a prior manual/admin-app write, but were NEVER committed to secrets/claude-tokens.sops.yaml. The Phase 13-02 Ansible deploy at 12:31 MSK overwrote the on-disk JSON with the empty SOPS content and restarted the exporter service (new pid 1619428). The new process loaded 0 tokens and has served empty metrics since 12:34 MSK. Grafana shows no data because the metric gauge series have no label values.

fix: Added tokens (makscee, andrey) to secrets/claude-tokens.sops.yaml via sops encrypt round-trip. Redeployed via `ansible-playbook playbooks/deploy-claude-usage-exporter.yml`. Exporter's 30s file-watch reload picked up the new JSON automatically — no service restart needed. Log confirmed "registry reloaded: 2 enabled tokens" at 20:26 WITA.

verification: journalctl shows "registry reloaded: 2 enabled tokens". /metrics endpoint serving. Prometheus will get fresh datapoints on next scrape after first 300s poll cycle (~20:31 WITA).
files_changed: [secrets/claude-tokens.sops.yaml]
