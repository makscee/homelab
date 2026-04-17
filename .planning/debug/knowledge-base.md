# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## claude-usage-grafana-stale — Grafana metrics gap caused by empty SOPS token registry overwriting live token JSON on deploy

- **Date:** 2026-04-17
- **Error patterns:** grafana, prometheus, empty metrics, 0 enabled tokens, registry reloaded, claude-usage, exporter, stale, no datapoints, tokens, SOPS, Ansible deploy
- **Root cause:** Two Claude API tokens (makscee, andrey) existed only in the on-disk /var/lib/claude-usage-exporter/claude-tokens.json on mcow (written manually/via admin app), but were never committed to secrets/claude-tokens.sops.yaml. An Ansible deploy wrote the empty SOPS content to the JSON file and restarted the service, leaving the exporter with 0 tokens and serving empty metrics ever since.
- **Fix:** Added both tokens to secrets/claude-tokens.sops.yaml via sops encrypt round-trip (copy plaintext to secrets path, encrypt, redirect to tmp, mv back). Redeployed via ansible-playbook — exporter's 30s file-watch reload picked up the populated JSON automatically without a service restart.
- **Files changed:** secrets/claude-tokens.sops.yaml
---
