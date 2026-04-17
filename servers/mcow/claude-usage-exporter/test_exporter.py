"""Unit tests for exporter.py mtime-poll reload + redaction.

Run: cd servers/mcow/claude-usage-exporter && python3 -m pytest test_exporter.py -x -v
"""

import json
import logging
import os
import time

import pytest

from exporter import _reload_registry_if_changed


def _write(path, data):
    path.write_text(json.dumps(data))


def test_reload_noop_on_unchanged_mtime(tmp_path):
    p = tmp_path / "reg.json"
    _write(
        p,
        {
            "tokens": [
                {
                    "id": "a",
                    "label": "a",
                    "value": "sk-ant-oat01-x",
                    "tier": "pro",
                    "owner_host": "h",
                    "enabled": True,
                    "added_at": "2026-04-17T00:00:00Z",
                }
            ]
        },
    )
    state = {}
    assert _reload_registry_if_changed(str(p), state) is True
    assert _reload_registry_if_changed(str(p), state) is False


def test_reload_loads_when_file_changes(tmp_path):
    p = tmp_path / "reg.json"
    _write(p, {"tokens": []})
    state = {}
    _reload_registry_if_changed(str(p), state)
    time.sleep(0.01)
    _write(
        p,
        {
            "tokens": [
                {
                    "id": "b",
                    "label": "b",
                    "value": "sk-ant-oat01-y",
                    "tier": "pro",
                    "owner_host": "h",
                    "enabled": True,
                    "added_at": "2026-04-17T00:00:00Z",
                }
            ]
        },
    )
    os.utime(p, (time.time() + 1, time.time() + 1))
    assert _reload_registry_if_changed(str(p), state) is True
    assert len(state["tokens"]) == 1


def test_reload_filters_disabled_and_soft_deleted(tmp_path):
    p = tmp_path / "reg.json"
    _write(
        p,
        {
            "tokens": [
                {
                    "id": "1",
                    "label": "a",
                    "value": "sk-ant-oat01-x",
                    "tier": "pro",
                    "owner_host": "h",
                    "enabled": True,
                    "added_at": "2026-04-17T00:00:00Z",
                },
                {
                    "id": "2",
                    "label": "b",
                    "value": "sk-ant-oat01-y",
                    "tier": "pro",
                    "owner_host": "h",
                    "enabled": False,
                    "added_at": "2026-04-17T00:00:00Z",
                },
                {
                    "id": "3",
                    "label": "c",
                    "value": "sk-ant-oat01-z",
                    "tier": "pro",
                    "owner_host": "h",
                    "enabled": True,
                    "added_at": "2026-04-17T00:00:00Z",
                    "deleted_at": "2026-04-17T01:00:00Z",
                },
            ]
        },
    )
    state = {}
    _reload_registry_if_changed(str(p), state)
    assert {t["label"] for t in state["tokens"]} == {"a"}


def test_reload_missing_file_keeps_last_known(tmp_path):
    state = {"tokens": [{"label": "prev"}], "mtime": 1.0}
    result = _reload_registry_if_changed(str(tmp_path / "nope.json"), state)
    assert result is False
    assert state["tokens"] == [{"label": "prev"}]


def test_logger_never_leaks_token_value(tmp_path, caplog):
    p = tmp_path / "reg.json"
    _write(
        p,
        {
            "tokens": [
                {
                    "id": "1",
                    "label": "l",
                    "value": "sk-ant-oat01-SECRETVALUE",
                    "tier": "pro",
                    "owner_host": "h",
                    "enabled": True,
                    "added_at": "2026-04-17T00:00:00Z",
                }
            ]
        },
    )
    with caplog.at_level(logging.DEBUG):
        _reload_registry_if_changed(str(p), {})
    joined = "\n".join(rec.getMessage() for rec in caplog.records)
    assert "SECRETVALUE" not in joined
    assert "sk-ant-oat01-" not in joined
