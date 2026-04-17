#!/usr/bin/env python3
"""Claude Code usage exporter for Prometheus.

Polls Anthropic API with minimal Haiku inference calls, parses rate-limit
headers, and exposes utilization metrics per named token.

Phase 13-02 (SEC-03) additions:
- argparse CLI flags (--bind-address, --port, --registry, --poll-interval, --reload-interval)
- mtime-poll registry reload (D-13-07): picks up admin-app SOPS writes
  within --reload-interval seconds without systemd restart
- filters out enabled=false and deleted_at!=null entries
- removes stale label-sets from gauges when tokens disappear from the registry
- redacts any sk-ant-oat01-* token prefix in log output
"""

import argparse
import json
import logging
import os
import time
from typing import Any, Dict, List, Optional, Set, Tuple

import requests
from prometheus_client import Counter, Gauge, start_http_server

POLL_INTERVAL_DEFAULT = 300  # 5 minutes
RELOAD_INTERVAL_DEFAULT = 30  # seconds between mtime checks
LISTEN_PORT_DEFAULT = 9101

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("claude-usage-exporter")
# Back-compat alias — existing code paths historically used `log`.
log = logger

# --- Secret redaction helpers ---------------------------------------------------

_TOKEN_PREFIX = "sk-ant-oat01-"


def _redact(s: Any) -> str:
    """Redact any Anthropic OAuth token prefix found in the given value.

    Returns `<TOKEN_PREFIX>[REDACTED]` when the string starts with the token
    prefix; otherwise returns the stringified input unchanged. Used in every
    log formatter that could receive a token value or an Exception whose repr
    contains one.
    """
    if s is None:
        return ""
    text = s if isinstance(s, str) else str(s)
    if _TOKEN_PREFIX in text:
        # Collapse any occurrence to the redacted marker, preserving the
        # prefix so operators still know WHICH kind of secret was filtered.
        return text.replace(
            text[text.index(_TOKEN_PREFIX):],
            f"{_TOKEN_PREFIX}[REDACTED]",
            1,
        )
    return text


# --- Prometheus metrics --------------------------------------------------------

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

# Gauges that use a per-token `name` label. Counters are excluded: dropping
# counter series mid-process would break Prometheus rate() calculations.
_LABEL_GAUGES = (
    usage_5h,
    usage_5h_reset,
    usage_7d,
    usage_7d_reset,
    usage_overage,
    last_poll,
)

# Module-level label-set tracker for stale-series cleanup.
_active_labels: Set[str] = set()


# --- Registry reload -----------------------------------------------------------


def _reload_registry_if_changed(path: str, state: Dict[str, Any]) -> bool:
    """Reload the token registry if its mtime has advanced.

    Args:
      path: absolute path to the decrypted registry JSON (nobody-readable).
      state: mutable dict with optional keys 'tokens' (list) and 'mtime' (float).

    Returns:
      True when the registry was re-read and `state` updated; False otherwise.

    Behavior:
      - FileNotFoundError → warn, keep previous state, return False.
      - Unchanged mtime → return False, no re-read.
      - Changed mtime → parse JSON, keep only entries with `enabled=True` and
        falsy `deleted_at`, store in `state['tokens']`, update `state['mtime']`,
        return True.
      - Log output never contains token values (only counts + path).
    """
    try:
        mtime = os.stat(path).st_mtime
    except FileNotFoundError:
        if state.get("tokens") is None:
            logger.warning(
                "registry file missing at %s; no tokens to poll", path
            )
        else:
            logger.warning(
                "registry file missing at %s; keeping last-known tokens", path
            )
        return False

    if state.get("mtime") == mtime:
        return False

    try:
        with open(path) as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        # Parse / read errors: warn without leaking file content. systemd will
        # restart us if this was a symptom of a deeper bug.
        logger.warning(
            "failed to parse registry at %s: %s", path, _redact(e)
        )
        return False

    tokens = [
        t
        for t in data.get("tokens", [])
        if t.get("enabled") and not t.get("deleted_at")
    ]
    state["tokens"] = tokens
    state["mtime"] = mtime
    logger.info(
        "registry reloaded: %d enabled tokens (path=%s)", len(tokens), path
    )
    return True


def _sync_gauge_labels(tokens: List[Dict[str, Any]]) -> None:
    """Drop label-series for tokens no longer present in the registry.

    Prevents stale Prometheus time-series from sticking around after a token
    is disabled or soft-deleted via the admin UI. Counters are intentionally
    left alone — dropping them would break `rate()`.
    """
    global _active_labels
    current = {t.get("label") or t.get("name") for t in tokens if t.get("label") or t.get("name")}
    stale = _active_labels - current
    for label in stale:
        for g in _LABEL_GAUGES:
            try:
                g.remove(label)
            except KeyError:
                pass
    _active_labels = current


# --- Token schema adapter ------------------------------------------------------


def _name_and_value(entry: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    """Return (display_name, token_value) tolerating both the Phase 13 schema
    (`label` + `value`) and the legacy v2 schema (`name` + `token`).
    """
    name = entry.get("label") or entry.get("name")
    value = entry.get("value") or entry.get("token")
    return name, value


# --- Polling -------------------------------------------------------------------


def poll_token(name: str, token: str) -> None:
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
            logger.warning(
                "token %s: HTTP %d — %s",
                name,
                resp.status_code,
                _redact(resp.text[:200]),
            )
            poll_error.labels(name=name).inc()
            return

        h = resp.headers
        usage_5h.labels(name=name).set(
            float(h.get("anthropic-ratelimit-unified-5h-utilization", 0))
        )
        usage_5h_reset.labels(name=name).set(
            float(h.get("anthropic-ratelimit-unified-5h-reset", 0))
        )
        usage_7d.labels(name=name).set(
            float(h.get("anthropic-ratelimit-unified-7d-utilization", 0))
        )
        usage_7d_reset.labels(name=name).set(
            float(h.get("anthropic-ratelimit-unified-7d-reset", 0))
        )
        usage_overage.labels(name=name).set(
            float(h.get("anthropic-ratelimit-unified-overage-utilization", 0))
        )
        last_poll.labels(name=name).set(time.time())
        poll_success.labels(name=name).inc()
        logger.info(
            "token %s: 5h=%.0f%% 7d=%.0f%%",
            name,
            float(h.get("anthropic-ratelimit-unified-5h-utilization", 0)) * 100,
            float(h.get("anthropic-ratelimit-unified-7d-utilization", 0)) * 100,
        )

    except Exception as e:
        logger.error("token %s: %s", name, _redact(e))
        poll_error.labels(name=name).inc()


def poll_all_tokens(tokens: List[Dict[str, Any]]) -> None:
    """Poll every enabled token, then prune stale gauge series."""
    for entry in tokens:
        name, value = _name_and_value(entry)
        if not name or not value:
            logger.warning("registry entry missing name/value — skipped")
            continue
        poll_token(name, value)
        time.sleep(2)  # stagger
    _sync_gauge_labels(tokens)


# --- Main loop -----------------------------------------------------------------


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Claude usage exporter")
    parser.add_argument("--bind-address", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=LISTEN_PORT_DEFAULT)
    parser.add_argument("--registry", required=True)
    parser.add_argument(
        "--poll-interval", type=int, default=POLL_INTERVAL_DEFAULT
    )
    parser.add_argument(
        "--reload-interval", type=int, default=RELOAD_INTERVAL_DEFAULT
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    state: Dict[str, Any] = {"tokens": None, "mtime": None}

    # Initial load so we have something to poll before entering the loop.
    _reload_registry_if_changed(args.registry, state)

    # prometheus_client.start_http_server binds on the given address:port.
    # The systemd unit also enforces IPAddressAllow/Deny as defense-in-depth.
    logger.info(
        "serving metrics on %s:%d (registry=%s, poll=%ds, reload=%ds)",
        args.bind_address,
        args.port,
        args.registry,
        args.poll_interval,
        args.reload_interval,
    )
    start_http_server(args.port, addr=args.bind_address)

    last_poll_ts = 0.0
    last_reload_ts = time.time()
    sleep_for = max(1, min(args.reload_interval, args.poll_interval) // 2)

    while True:
        now = time.time()
        if now - last_reload_ts >= args.reload_interval:
            _reload_registry_if_changed(args.registry, state)
            last_reload_ts = now
        if now - last_poll_ts >= args.poll_interval:
            poll_all_tokens(state.get("tokens") or [])
            last_poll_ts = now
        time.sleep(sleep_for)


if __name__ == "__main__":
    main()
