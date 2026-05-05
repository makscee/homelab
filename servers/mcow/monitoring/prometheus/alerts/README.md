# Alert Rules — homelab.yml

This directory contains Prometheus alerting rules for the homelab monitoring stack.

## Active Alerts

| Alert | Group | Severity | Threshold | Source |
|-------|-------|----------|-----------|--------|
| HostDown | homelab.nodes | critical | up==0 for 5m | node-exporter |
| DiskUsageCritical | homelab.nodes | critical | >90% used for 5m | node-exporter |
| MemoryPressure | homelab.nodes | warning | <10% available for 10m | node-exporter |
| ContainerRestartLoop | homelab.containers | warning | >3 restarts in 15m | cAdvisor |
| CAdvisorDown | homelab.containers | warning | up==0 for 5m | Prometheus scrape |
| PrometheusSelfScrapeFailure | homelab.prometheus | critical | up==0 for 2m | Prometheus self |
| AlertmanagerDown | homelab.prometheus | critical | absent or up==0 for 5m | Prometheus scrape |

All thresholds match CONTEXT.md decisions. Runbook references point to the relevant
`servers/{host}/inventory.md` files in this repo.

## Deferred: Certificate Expiry Alert

The CONTEXT.md specifies a cert-expiry alert (TLS cert <30d). This alert is intentionally
deferred because Phase 03 does not include a cert-expiry exporter in scope. See RESEARCH.md
Risk 7.

A commented placeholder rule exists at the bottom of `homelab.yml`. Enable it in a future
phase by:
1. Deploying `prom/blackbox-exporter` or `enix/x509-certificate-exporter` on docker-tower
2. Adding a corresponding scrape job to `prometheus.yml`
3. Uncommenting the `CertificateExpiryWarning` rule in `homelab.yml`

## Validation

```bash
promtool check rules servers/docker-tower/monitoring/prometheus/alerts/homelab.yml
```

All rule changes must pass `promtool check rules` before commit (SEC-02 pattern — git
history is the audit trail for rule changes).
