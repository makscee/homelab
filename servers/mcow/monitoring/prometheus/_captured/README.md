# _captured/ — Forensic Snapshots (Read-Only Reference)

These files are captured snapshots of the **live state** on docker-tower as of the
capture date. They are retained for diff/forensic purposes only.

**They are NOT consumed at deploy time.** The canonical config is `../prometheus.yml`.

## Files

| File | Captured From | Purpose |
|------|--------------|---------|
| `prometheus.yml.live` | `/opt/homestack/monitoring/prometheus/prometheus.yml` on docker-tower | Pre-migration baseline |
| `alerts.yml.live` | `/opt/homestack/monitoring/prometheus/alerts.yml` on docker-tower | Pre-migration baseline (empty/absent if shown as comment) |

## Captured: 2026-04-14 (Plan 03-01 Task 0b)

## Notes on Live Config vs Canonical Config

The live `prometheus.yml.live` contains scrape jobs not carried forward to the canonical config:

| Live Job | Target | Disposition |
|----------|--------|-------------|
| `tower-api-docker-tower` | `127.0.0.1:8000` | **Dropped** — custom Tower API metrics; not in Phase 03 scope |
| `tower-api-nether` | `nether:8001` | **Dropped** — same; nether endpoint unreliable |
| `docker` | `127.0.0.1:9323` | **Dropped** — Docker daemon metrics replaced by cAdvisor (:8080) |
| `docker-tower` | `127.0.0.1:9100` | **Migrated** → `100.101.0.8:9100` in nodes.yml (Tailnet IP, file_sd) |
| `nether` | `nether:9100` | **Migrated** → `100.101.0.3:9100` in nodes.yml (Tailnet IP, file_sd) |
| `prometheus` | `127.0.0.1:9090` | **Preserved** in canonical prometheus.yml static_configs |

If the Tower API metrics need to be re-added in a future phase, add a new job to
`../prometheus.yml` targeting `100.101.0.8:8000` with a `job_name: 'tower-api'` entry.
