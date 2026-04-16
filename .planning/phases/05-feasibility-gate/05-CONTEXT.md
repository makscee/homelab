# Phase 05: Feasibility Gate - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 05 empirically validates that a Prometheus exporter CAN reliably read Claude Code OAuth quotas from `api.anthropic.com/api/oauth/usage` before any v2.0 build work proceeds. Phase outputs are: (a) a pass/fail verdict recorded as `GATE-PASSED.md` or `GATE-FAILED.md`, (b) ADR D-07 in `PROJECT.md` capturing ToS interpretation + approach + soak evidence + operator sign-off, (c) a throwaway soak spike that is discarded post-verdict.

**In scope:**
- Proving mcow → nether App Connector → `api.anthropic.com` egress works end-to-end.
- A 24h soak collecting evidence that the endpoint is reachable and rate-limit-stable at the spec cadence.
- Validating the JSON response schema matches `STACK.md` expectations.
- Writing ADR D-07 with the decided approach and fallback posture.

**Out of scope (belongs in Phase 06+):**
- The production Python/httpx exporter.
- SOPS-managed multi-token registry schema (Phase 08).
- Prometheus scrape config (Phase 07).
- Any runtime kill-switch implementation.

</domain>

<decisions>
## Implementation Decisions

### Quota Source Approach
- **D-05-01:** Endpoint-scrape only. No ccusage local-log path, no hybrid fallback. The exporter (and this spike) must obtain quota data using ONLY an auth token — no dependency on Claude Code session files, local logs, or per-host agents. User constraint: "find a way to get same data with only a auth token."
- **D-05-02 (flagged for research):** Research phase MUST answer whether equivalent `/usage` data is reachable via API-key auth (Claude Console / Admin API) or whether OAuth `sk-ant-oat01-*` is the only path. Decision affects ToS posture and long-term token lifecycle (API keys don't expire in ~4d).

### ToS Stance
- **D-05-03:** ToS interpretation is **ambiguous — proceed carefully**. Defensive posture:
  - Self-throttle beyond spec cadence if backend signals strain (Retry-After honored, exponential back-off on 429).
  - Halt-on-persistent-401/403 is a hard stop (D-05-09).
  - No automatic ccusage fallback exists (ruled out by D-05-01).
  - ADR D-07 documents the user's "monitoring own tokens = in-scope self-observability" reasoning plus accepted residual risk from `PITFALLS.md` A-01 / A-04.

### Soak Parameters
- **D-05-04:** Token source — reuse existing operator OAuth token (not a dedicated fresh `claude setup-token`). Soak consumes ~20% of token's ~4-day lifetime; ADR D-07 must note which operator's token was used and on what date to scope the validity of soak evidence.
- **D-05-05:** Cadence — 300s ±60s uniform jitter, one token, 24h. ~288 requests total. <5% HTTP 429 = pass. Matches ROADMAP Phase 05 success criterion #2 verbatim.

### Failure Posture + Halt Signal
- **D-05-06:** Hard halts (block Phase 06+): **egress blocked** (curl fails from mcow) OR **persistent 401/403** on auth. Either kills the endpoint-scrape-only approach and — with no fallback — forces milestone re-scoping.
- **D-05-07:** Soft halts (rework signals, not milestone kills): schema mismatch (triggers research re-scope), ≥5% 429 (triggers jitter/cadence re-tune + re-soak).
- **D-05-08:** Halt artifact — `.planning/phases/05-feasibility-gate/GATE-FAILED.md` with reason + evidence + next-action. Commit. `STATE.md` status flipped to `blocked`. Document-first, AI-readable.
- **D-05-09:** Pass artifact — `.planning/phases/05-feasibility-gate/GATE-PASSED.md` with soak summary (N requests, 429 count, per-response latency min/p50/p95/max, distinct schema-hash count), 3+ full response samples, curl transcripts, ADR D-07 link. Reviewable without re-running soak.

### Spike Exporter Shape
- **D-05-10:** Form — bash + curl + jq, invoked by a systemd timer (`OnUnitActiveSec=300s` with `RandomizedDelaySec=60s`). JSONL log at `/var/log/claude-usage-soak.jsonl`. No container, no language commitment, no Prometheus wiring. Disposable — systemd units removed and log archived to `GATE-PASSED.md` evidence post-soak.
- **D-05-11:** Host — runs on **mcow**. Exercises MON-02 (App Connector routing) and MON-03 (egress smoke) end-to-end. If feasibility fails because of egress, it surfaces here where it's cheapest to fix.
- **D-05-12:** Schema validation — sorted-JSON-key hash per response, logged inline with each JSONL row. Post-soak: assert ≥3 distinct samples share the same hash AND each contains required fields (`five_hour.utilization`, `seven_day.utilization`, `seven_day_sonnet.utilization`, `resets_at`). Cheap, detects silent schema drift across the 24h window.

### Egress Mechanics
- **D-05-13:** Extend the existing nether App Connector (the one already advertising Telegram CIDRs — see project memory `project_mcow_egress_lesson.md`) with `api.anthropic.com` domain-based advertisement. Reuses proven pattern: `tag:connector` on nether + ACL `nodeAttrs` with `"attr:app-connector"` + `--accept-routes` on mcow + Tailscale admin-console → DNS → App Connectors entry. No new connector instance.

### Kill-Switch (Runtime)
- **D-05-14:** Deferred entirely to Phase 06 planning. Not a feasibility-gate concern.

### Claude's Discretion
- Exact jitter RNG seed/method (`$RANDOM`, `/dev/urandom`, or systemd `RandomizedDelaySec`). Recommend `RandomizedDelaySec` for kernel-provided randomness.
- JSONL row shape — as long as it captures `ts`, `http_status`, `latency_ms`, `response_body_or_hash`, `schema_hash`, `retry_after_header_if_any`, planner may add more fields.
- User-Agent header choice for curl — research should inform this (A-03 fingerprinting guidance + A-01 ToS-surface). Don't impersonate Claude Code itself; don't leave curl default either. Plain `claude-usage-soak/0.1` is a safe default.
- systemd unit file location (`/etc/systemd/system/` vs user unit) — prefer system unit for reliability.
- How to cleanly tear down post-soak (commit a teardown script alongside the spike, or document manual steps).
- Exact format of the schema-hash (SHA-256 of sorted-key canonical JSON; or just sorted-key string; or jq's recursive-keys hash). Planner picks.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 05 Roadmap Entry
- `.planning/ROADMAP.md` §`Phase 05: Feasibility Gate` — Goal, depends-on, success criteria (4 items), requirements (MON-02, MON-03, DEPLOY-03).

### v2.0 Research (read all — feasibility decisions are spread across these)
- `.planning/research/STACK.md` §`Critical: Anthropic Usage API Endpoint` — Endpoint URL, required headers, response schema, rate-limit notes, token-expiry mechanics. Also §`Confidence on endpoint itself: HIGH`.
- `.planning/research/ARCHITECTURE.md` §`Egress Path Decision` — Evidence for why mcow needs nether App Connector. Also §`New Tailscale / firewall holes`.
- `.planning/research/PITFALLS.md` — **Mandatory full read.** Especially:
  - §`A-01 — Using OAuth tokens outside Claude Code violates ToS (CRITICAL)` — ADR D-07 anchor point.
  - §`A-02 — OAuth tokens expire (~4 days)` — Affects D-05-04 token choice.
  - §`A-03 — Polling frequency can trip rate limits or fingerprinting` — Affects D-05-05 cadence.
  - §`A-04 — Undocumented endpoint changes without notice` — Affects D-05-12 schema-hash design.
  - §`H-01 — Moscow ISP may block api.anthropic.com (CRITICAL — direct v1.0 replay)` — Core failure mode this gate tests.
  - §`P-05 — Counter reset on weekly boundary confused with restart` — Affects later phases but shapes schema-hash interpretation.
- `.planning/research/FEATURES.md` §`Max 20x Subscription Mechanics` — Session windows, weekly anchors, model split. Validates what `/usage` values should look like.
- `.planning/research/FEATURES.md` §`The critical feasibility caveat — endpoint behavior` — Explicitly states what Phase 05 must resolve.

### v2.0 Requirements Being Validated
- `.planning/REQUIREMENTS.md` §`Monitoring Integration (MON-*)` — MON-02 (mcow egress via nether App Connector), MON-03 (egress smoke before exporter deploy).
- `.planning/REQUIREMENTS.md` §`Deploy (DEPLOY-*)` — DEPLOY-03 (feasibility gate requirement listed in roadmap).

### Project-Level
- `.planning/PROJECT.md` — Key Decisions table (destination for ADR D-07). Principles: document-first, Claude Code as operator, SOPS+age for secrets.
- `.planning/STATE.md` §`Decisions` — Current v2.0 pending ADR entry for D-07 confirms this phase owns it.
- `CLAUDE.md` — Server table: mcow (100.101.0.9), nether (100.101.0.3) — Tailscale IPs + Moscow/Netherlands geography.

### v1.0 Operational Evidence (carry forward)
- Project memory: `~/.claude/projects/-Users-admin-hub-workspace-homelab/memory/project_mcow_egress_lesson.md` — Moscow ISP L4-blocks behavior, App Connector pattern already proven on nether for Telegram CIDRs, tag:connector / ACL nodeAttrs / --accept-routes recipe.
- Project memory: `~/.claude/projects/-Users-admin-hub-workspace-homelab/memory/feedback_verify_ui.md` — API-200 ≠ works; GATE-PASSED evidence must include end-to-end proof, not just HTTP 200.

### Phase 04 Prior Decisions (carry forward where relevant)
- `.planning/phases/04-operator-dashboard/04-CONTEXT.md` §`Alertmanager Co-location` — Alertmanager now on mcow; Phase 09 alerts will land in the same stack Phase 05 validates egress for.
- `.planning/phases/04-operator-dashboard/04-CONTEXT.md` §`Reusable Assets` — mcow's existing monitoring directory structure is the template for Phase 06+.

### External (research should pull if gaps exist)
- Anthropic ToS / Usage Policy (April 2026 version) — ADR D-07 quoted text.
- Tailscale App Connector docs — domain-based advertisement (for D-05-13).
- `ccusage` GitHub repo — prior art reference (NOT a fallback; ruled out by D-05-01).
- GitHub issues `anthropics/claude-code#19880`, `anthropics/claude-code#32796` — Community requests for official quota endpoint. Status at time of feasibility is evidence for ADR D-07.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **nether App Connector (live):** Already advertises Telegram CIDRs (`149.154.166.110/32`, `149.154.167.99/32`) under `tag:connector`. Adding `api.anthropic.com` is a config extension, not a new build. See project memory.
- **mcow monitoring directory:** Phase 04 established `servers/mcow/monitoring/` tree; Phase 05 creates a sibling (or ephemeral) `servers/mcow/soak/` for the spike — planner picks exact layout.
- **Ansible `deploy-docker-tower.yml` pattern** — Sibling `deploy-mcow.yml` (if it exists from Phase 04) or equivalent is the pattern for any playbook that configures systemd units on mcow. Spike may or may not use Ansible — if disposable, plain SSH is acceptable.

### Established Patterns
- SSH via Tailscale: `ssh root@mcow` (Tailnet IP `100.101.0.9`).
- Document-first → numbered-steps-for-operator in any runbook. GATE-PASSED/GATE-FAILED must be AI-readable.
- Secrets: SOPS+age at hub level, bind-mounted read-only into containers. Spike reuses existing operator token — if that token is already in a SOPS file, read it via `sops -d`; if it's plain env on operator laptop, spike accepts it via `curl -H "Authorization: Bearer $TOKEN"` from a `600`-perm file deleted post-soak.
- systemd timers on mcow are the standard scheduler (Prometheus runs on docker-tower; mcow runs Alertmanager + soon-to-be exporter).

### Integration Points
- **nether Tailscale admin console** — manual step to enable the App Connector's new domain advertisement (MON-02). Document this as an operator step with screenshots-or-CLI commands.
- **Tailscale ACL file** (if repo-managed) — `nodeAttrs` with `"attr:app-connector"` may already be present for Telegram; verify before editing.
- **mcow hosts file / `--accept-routes`** — mcow must already accept routes for Telegram egress to work; verify `tailscale status` shows the expected subnet.

</code_context>

<specifics>
## Specific Ideas

- User framed the constraint crisply: "do not use local log, only what actually would be returned by /usage, find a way to get same data with only a auth token." This rules OUT any approach that reads Claude Code session files (`~/.claude/...`), tails stdout/stderr of `claude`, or assumes a running Claude Code process. The spike and the real exporter are pure HTTP clients against `api.anthropic.com` authenticated by a token in an env/SOPS file.
- ADR D-07 defensive posture: "ambiguous — proceed carefully" means the ADR must explicitly list which ToS clauses are being weighed, why the user considers this self-observability, and what conditions would flip the verdict (e.g., Anthropic publishes an explicit prohibition).
- Soak evidence must be end-to-end per `feedback_verify_ui` — not just "200 OK logged" but "parsed body contains required fields across ≥3 distinct samples."

</specifics>

<deferred>
## Deferred Ideas

- **Dedicated soak token via fresh `claude setup-token` on mcow** — rejected in favor of reusing operator token (D-05-04). Revisit in Phase 08 when SOPS token registry is built — at that point fresh tokens on mcow become the default.
- **Python prototype as Phase 06 seed** — rejected in favor of disposable bash spike (D-05-10). Phase 06 starts fresh; no code reuse from Phase 05. Revisit if Phase 06 planning shows value in a language/framework starter.
- **Parallel soak on mcow + docker-tower** — rejected because reusing one operator token = one soak stream (D-05-04 constraint). If Phase 08 builds a real test token pool, multi-host soak becomes possible.
- **Runtime kill-switch (env var, SIGUSR1, etc.)** — deferred to Phase 06 per D-05-14.
- **JSON Schema file + ajv/jsonschema validation** — rejected in favor of hash-of-keys sampling (D-05-12). Revisit if Phase 06 exporter wants stricter response validation at runtime.
- **GF_SECURITY_ADMIN_* cleanup on nether** — carried-forward v1.0 tech-debt, tracked elsewhere, not Phase 05's concern.

</deferred>

---

*Phase: 05-feasibility-gate*
*Context gathered: 2026-04-16*
