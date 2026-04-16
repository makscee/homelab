#!/usr/bin/env bash
# analyze.sh --- post-soak analyzer. Reads JSONL, prints summary + writes $OUT.
# Usage: analyze.sh [/var/log/claude-usage-soak.jsonl] [out.txt]
set -euo pipefail
LOG=${1:-/var/log/claude-usage-soak.jsonl}
OUT=${2:-/tmp/claude-usage-soak-analysis.txt}
test -s "$LOG" || { echo "empty log: $LOG" >&2; exit 2; }
{
  echo "# Claude Usage Soak Analysis"
  echo "log: $LOG"
  echo "generated_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  TOTAL=$(wc -l < "$LOG")
  echo "total_rows: $TOTAL"
  echo "first_ts:   $(jq -r 'select(.ts)|.ts' "$LOG" | head -1)"
  echo "last_ts:    $(jq -r 'select(.ts)|.ts' "$LOG" | tail -1)"
  echo
  echo "## HTTP status distribution"
  jq -r '.http_status' "$LOG" | sort | uniq -c | sort -rn
  echo
  N200=$(jq -r 'select(.http_status==200)|.http_status' "$LOG" | wc -l)
  N429=$(jq -r 'select(.http_status==429)|.http_status' "$LOG" | wc -l)
  N4xx_auth=$(jq -r 'select(.http_status==401 or .http_status==403)|.http_status' "$LOG" | wc -l)
  NERR=$(jq -r 'select(.http_status==0 or .curl_exit!=0)|1' "$LOG" | wc -l)
  echo "total=$TOTAL"
  echo "http_200=$N200"
  echo "http_429=$N429"
  echo "http_401_403=$N4xx_auth"
  echo "network_errors=$NERR"
  awk -v t="$TOTAL" -v x="$N429" 'BEGIN{if(t>0)printf "http_429_ratio=%.4f\n", x/t}'
  echo
  echo "## Latency (ms) on 200 responses"
  jq -r 'select(.http_status==200)|.latency_ms' "$LOG" | sort -n | awk '
    { a[NR]=$1 }
    END {
      if (NR==0) { print "no 200 responses"; exit }
      p(50); p(95); p(99)
      printf "min=%d\nmax=%d\nmean=%.1f\n", a[1], a[NR], s/NR
    }
    function p(pct,  i) { i=int(NR*pct/100); if(i<1)i=1; printf "p%d=%d\n", pct, a[i] }
    { s+=$1 }
  '
  echo
  echo "## Distinct schema_hash values across 200 responses"
  jq -r 'select(.http_status==200 and .schema_hash)|.schema_hash' "$LOG" | sort -u | tee /tmp/_hashes.txt
  DISTINCT=$(wc -l < /tmp/_hashes.txt)
  echo "distinct_hashes=$DISTINCT"
  echo
  echo "## Schema-match count"
  jq -r 'select(.http_status==200)|.schema_match' "$LOG" | sort | uniq -c
  echo
  echo "## 3 sample bodies (first, middle, last 200-OK rows)"
  jq -c 'select(.http_status==200) | {ts,schema_hash,required_fields_present}' "$LOG" | awk -v t="$N200" 'NR==1 || NR==int(t/2) || NR==t'
} | tee "$OUT"
