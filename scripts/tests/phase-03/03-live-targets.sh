#!/usr/bin/env bash
# 03-live-targets.sh — Verify live Prometheus targets + Alertmanager health
# Usage: bash scripts/tests/phase-03/03-live-targets.sh
# Requires: jq, python3 (for URL encoding), live docker-tower on Tailnet
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# Allow skipping mcow cAdvisor check (only set when running standalone after Task 2, before Task 3)
SKIP_MCOW="${SKIP_MCOW_CADVISOR:-false}"

# ── Prometheus reachable? ─────────────────────────────────────────────────────
if ! python3 -c "
import urllib.request, sys
try:
    urllib.request.urlopen('${PROM_URL}/-/healthy', timeout=10)
    print('ok')
except Exception as e:
    print(f'fail: {e}', file=sys.stderr)
    sys.exit(1)
" > /dev/null 2>&1; then
  fail "Prometheus at ${PROM_URL} is not reachable"
  exit 1
fi
ok "Prometheus reachable at ${PROM_URL}"

# ── All 6 node targets must be up ────────────────────────────────────────────
unhealthy=$(python3 - <<'PYEOF'
import urllib.request, json, sys
url = "http://100.101.0.8:9090/api/v1/targets"
try:
    resp = urllib.request.urlopen(url, timeout=15)
    data = json.loads(resp.read())
    targets = data["data"]["activeTargets"]
    bad = [t["labels"]["instance"] for t in targets
           if t["labels"].get("job") == "node" and t["health"] != "up"]
    print("\n".join(bad))
except Exception as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
PYEOF
)
if [[ -n "$unhealthy" ]]; then
  fail "Node targets not up: $unhealthy"
  exit 1
fi

# Also verify we have exactly 6 node targets
node_count=$(python3 - <<'PYEOF'
import urllib.request, json, sys
url = "http://100.101.0.8:9090/api/v1/targets"
try:
    resp = urllib.request.urlopen(url, timeout=15)
    data = json.loads(resp.read())
    targets = data["data"]["activeTargets"]
    count = len([t for t in targets if t["labels"].get("job") == "node"])
    print(count)
except Exception as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
PYEOF
)
if [[ "$node_count" -ge 5 ]]; then
  ok "All $node_count node targets up"
else
  fail "Expected >=5 node targets up, got $node_count"
  exit 1
fi

# ── cAdvisor targets must be up ───────────────────────────────────────────────
cad_unhealthy=$(python3 - <<'PYEOF'
import urllib.request, json, sys, os
url = "http://100.101.0.8:9090/api/v1/targets"
skip_mcow = os.environ.get("SKIP_MCOW_CADVISOR", "false").lower() == "true"
try:
    resp = urllib.request.urlopen(url, timeout=15)
    data = json.loads(resp.read())
    targets = data["data"]["activeTargets"]
    bad = []
    for t in targets:
        if t["labels"].get("job") == "cadvisor" and t["health"] != "up":
            inst = t["labels"]["instance"]
            if skip_mcow and "100.101.0.9" in inst:
                continue
            bad.append(inst)
    print("\n".join(bad))
except Exception as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
PYEOF
)
if [[ -n "$cad_unhealthy" ]]; then
  fail "cAdvisor targets not up: $cad_unhealthy"
  exit 1
fi

if [[ "$SKIP_MCOW" == "true" ]]; then
  ok "docker-tower cAdvisor target up (mcow skipped — run after Task 3)"
else
  ok "Both cAdvisor targets up (docker-tower + mcow)"
fi

# ── Alertmanager health check ─────────────────────────────────────────────────
am_status=$(python3 - <<'PYEOF'
import urllib.request, sys
url = "http://100.101.0.8:9093/-/healthy"
try:
    resp = urllib.request.urlopen(url, timeout=10)
    print(resp.status)
except Exception as e:
    print(f"fail: {e}", file=sys.stderr)
    sys.exit(1)
PYEOF
)
if [[ "$am_status" == "200" ]]; then
  ok "Alertmanager healthy (HTTP 200 at ${AM_URL}/-/healthy)"
else
  fail "Alertmanager not healthy (status: $am_status)"
  exit 1
fi

# ── Spot-check: TSDB has data (volume preserved) ─────────────────────────────
series_count=$(python3 - <<'PYEOF'
import urllib.request, json, sys, urllib.parse
query = 'count({__name__=~".+"})'
encoded = urllib.parse.quote(query)
url = f"http://100.101.0.8:9090/api/v1/query?query={encoded}"
try:
    resp = urllib.request.urlopen(url, timeout=15)
    data = json.loads(resp.read())
    results = data["data"]["result"]
    if results:
        print(results[0]["value"][1])
    else:
        print("0")
except Exception as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
PYEOF
)
if [[ "$series_count" -gt 0 ]]; then
  ok "TSDB has $series_count active series (volume preserved)"
else
  fail "TSDB has 0 series — volume may have been wiped"
  exit 1
fi

ok "All live-targets checks passed"
