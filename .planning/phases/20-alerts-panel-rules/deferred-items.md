# Deferred Items — Phase 20

## Pre-existing test failures (out of scope)

### homelab_test.yml: DiskUsageCritical test fixture mismatch
- **Found during:** Phase 20 Plan 02 promtool run
- **File:** `servers/docker-tower/monitoring/prometheus/tests/homelab_test.yml` lines 31-51
- **Issue:** Test expects `DiskUsageCritical` to fire at 95% disk full, but rule expr is `> 0.98` (committed in `e39446f` phase 03-05). Test summary also says ">90%" but rule is ">98%".
- **Status:** Pre-existing; unrelated to ALERT-03/ALERT-04. Plan 20-02 did not modify this test block or rule.
- **Fix path:** Future plan: either tighten test fixture to 99% avail=1/100, or align rule threshold with test.
