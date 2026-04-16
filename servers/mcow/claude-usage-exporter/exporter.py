#!/usr/bin/env python3
"""Claude Code usage exporter for Prometheus.

Polls Anthropic API with minimal Haiku inference calls, parses rate-limit
headers, and exposes utilization metrics per named token.
"""

import json
import logging
import sys
import threading
import time
from pathlib import Path

import requests
from prometheus_client import Counter, Gauge, start_http_server

CONFIG_PATH = Path("/opt/claude-usage-exporter/config.json")
POLL_INTERVAL = 300  # 5 minutes
LISTEN_PORT = 9101

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("claude-usage-exporter")

# --- Prometheus metrics ---

usage_5h = Gauge(
    "claude_usage_5h_utilization",
    "5-hour window utilization (0.0-1.0)",
    ["name"],
)
usage_5h_reset = Gauge(
    "claude_usage_5h_reset_timestamp",
    "5-hour window reset Unix timestamp",
    ["name"],
)
usage_7d = Gauge(
    "claude_usage_7d_utilization",
    "7-day window utilization (0.0-1.0)",
    ["name"],
)
usage_7d_reset = Gauge(
    "claude_usage_7d_reset_timestamp",
    "7-day window reset Unix timestamp",
    ["name"],
)
usage_overage = Gauge(
    "claude_usage_overage_utilization",
    "Overage utilization (0.0-1.0)",
    ["name"],
)
poll_success = Counter(
    "claude_usage_poll_success_total",
    "Successful polls",
    ["name"],
)
poll_error = Counter(
    "claude_usage_poll_error_total",
    "Failed polls",
    ["name"],
)
last_poll = Gauge(
    "claude_usage_last_poll_timestamp",
    "Last successful poll Unix timestamp",
    ["name"],
)


def load_config():
    with open(CONFIG_PATH) as f:
        cfg = json.load(f)
    tokens = cfg.get("tokens", [])
    if not tokens:
        log.error("No tokens in config")
        sys.exit(1)
    for t in tokens:
        if not t.get("name") or not t.get("token"):
            log.error("Each token entry needs 'name' and 'token' fields")
            sys.exit(1)
    return tokens


def poll_token(name: str, token: str):
    try:
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "Authorization": f"Bearer {token}",
                "anthropic-version": "2023-06-01",
                "anthropic-beta": "oauth-2025-04-20",
                "Content-Type": "application/json",
                "User-Agent": "claude-usage-exporter/0.1",
            },
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 1,
                "messages": [{"role": "user", "content": "."}],
            },
            timeout=30,
        )
        if resp.status_code != 200:
            log.warning("Token %s: HTTP %d — %s", name, resp.status_code, resp.text[:200])
            poll_error.labels(name=name).inc()
            return

        h = resp.headers
        usage_5h.labels(name=name).set(float(h.get("anthropic-ratelimit-unified-5h-utilization", 0)))
        usage_5h_reset.labels(name=name).set(float(h.get("anthropic-ratelimit-unified-5h-reset", 0)))
        usage_7d.labels(name=name).set(float(h.get("anthropic-ratelimit-unified-7d-utilization", 0)))
        usage_7d_reset.labels(name=name).set(float(h.get("anthropic-ratelimit-unified-7d-reset", 0)))
        usage_overage.labels(name=name).set(float(h.get("anthropic-ratelimit-unified-overage-utilization", 0)))
        last_poll.labels(name=name).set(time.time())
        poll_success.labels(name=name).inc()
        log.info("Token %s: 5h=%.0f%% 7d=%.0f%%", name, float(h.get("anthropic-ratelimit-unified-5h-utilization", 0)) * 100, float(h.get("anthropic-ratelimit-unified-7d-utilization", 0)) * 100)

    except Exception as e:
        log.error("Token %s: %s", name, e)
        poll_error.labels(name=name).inc()


def poll_loop(tokens):
    while True:
        for t in tokens:
            poll_token(t["name"], t["token"])
            time.sleep(2)  # stagger between tokens
        time.sleep(POLL_INTERVAL)


def main():
    tokens = load_config()
    log.info("Loaded %d token(s): %s", len(tokens), ", ".join(t["name"] for t in tokens))

    # Initial poll before serving metrics
    for t in tokens:
        poll_token(t["name"], t["token"])
        time.sleep(2)

    # Start background poller
    threading.Thread(target=poll_loop, args=(tokens,), daemon=True).start()

    # Serve /metrics
    log.info("Serving metrics on :%d", LISTEN_PORT)
    start_http_server(LISTEN_PORT)

    # Block forever
    threading.Event().wait()


if __name__ == "__main__":
    main()
