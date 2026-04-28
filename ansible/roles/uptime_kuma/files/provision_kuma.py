#!/usr/bin/env python3
"""Idempotently provision uptime-kuma admin user, monitors, TG notifier, status page.

Inputs via env:
  KUMA_URL                full URL to kuma (e.g. http://127.0.0.1:3001)
  KUMA_ADMIN_USER         admin username (created on first run if absent)
  KUMA_ADMIN_PASS         admin password
  KUMA_TG_BOT_TOKEN       Telegram bot token
  KUMA_TG_CHAT_ID         Telegram chat id
  KUMA_STATUS_SLUG        public status page slug
  KUMA_STATUS_TITLE       public status page title
  KUMA_MONITORS_JSON      JSON list: [{"name":..., "type":"http", "url":..., "interval":60, "expect_status":200}, ...]

Exit non-zero on any failure. Print json summary on success.
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any

from uptime_kuma_api import UptimeKumaApi, MonitorType


def env(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        print(f"missing env: {name}", file=sys.stderr)
        sys.exit(2)
    return v


def main() -> int:
    url = env("KUMA_URL")
    admin_user = env("KUMA_ADMIN_USER")
    admin_pass = env("KUMA_ADMIN_PASS")
    tg_token = env("KUMA_TG_BOT_TOKEN")
    tg_chat = env("KUMA_TG_CHAT_ID")
    slug = env("KUMA_STATUS_SLUG")
    title = env("KUMA_STATUS_TITLE")
    monitors: list[dict[str, Any]] = json.loads(env("KUMA_MONITORS_JSON"))

    summary = {"created": [], "updated": [], "unchanged": []}

    with UptimeKumaApi(url) as api:
        # 1. Bootstrap admin if needed.
        try:
            api.login(admin_user, admin_pass)
        except Exception:
            # First-run — no admin yet. Create.
            api.setup(admin_user, admin_pass)
            api.login(admin_user, admin_pass)
            summary["created"].append({"kind": "admin", "name": admin_user})

        # 2. TG notifier (idempotent by name).
        notifier_name = "telegram-operator"
        existing_notifs = {n["name"]: n for n in api.get_notifications()}
        notif_payload = dict(
            name=notifier_name,
            type="telegram",
            isDefault=True,
            applyExisting=True,
            telegramBotToken=tg_token,
            telegramChatID=tg_chat,
        )
        if notifier_name in existing_notifs:
            api.edit_notification(existing_notifs[notifier_name]["id"], **notif_payload)
            summary["updated"].append({"kind": "notifier", "name": notifier_name})
        else:
            api.add_notification(**notif_payload)
            summary["updated"].append({"kind": "notifier", "name": notifier_name})

        # Re-read to get id.
        notifier_id = next(
            n["id"] for n in api.get_notifications() if n["name"] == notifier_name
        )

        # 3. Monitors (idempotent by name).
        existing_mons = {m["name"]: m for m in api.get_monitors()}
        for m in monitors:
            payload = dict(
                type=MonitorType.HTTP,
                name=m["name"],
                url=m["url"],
                interval=m.get("interval", 60),
                accepted_statuscodes=[str(m.get("expect_status", 200))],
                notificationIDList={str(notifier_id): True},
            )
            if m["name"] in existing_mons:
                api.edit_monitor(existing_mons[m["name"]]["id"], **payload)
                summary["updated"].append({"kind": "monitor", "name": m["name"]})
            else:
                api.add_monitor(**payload)
                summary["created"].append({"kind": "monitor", "name": m["name"]})

        # 4. Public status page (idempotent by slug).
        monitor_ids = [
            mid["id"]
            for mid in api.get_monitors()
            if mid["name"] in {m["name"] for m in monitors}
        ]
        pages = {p["slug"]: p for p in api.get_status_pages()}
        page_payload = dict(
            title=title,
            description="voidnet uptime",
            publicGroupList=[
                {
                    "name": "voidnet",
                    "weight": 1,
                    "monitorList": [{"id": mid} for mid in monitor_ids],
                }
            ],
        )
        if slug in pages:
            api.save_status_page(slug, **page_payload)
            summary["updated"].append({"kind": "status_page", "name": slug})
        else:
            api.add_status_page(slug, title)
            api.save_status_page(slug, **page_payload)
            summary["created"].append({"kind": "status_page", "name": slug})

    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
