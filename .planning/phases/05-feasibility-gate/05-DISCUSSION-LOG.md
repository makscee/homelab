# Phase 05: Feasibility Gate - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 05-feasibility-gate
**Areas discussed:** Quota source approach, Failure posture + halt signal, Spike exporter shape
**Areas skipped by user:** Soak test token strategy (folded into Area 1 follow-up Q3)

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Quota source approach | Local-log vs endpoint-scrape vs hybrid — THE blocking decision per PITFALLS header | ✓ |
| Soak test token strategy | Real Max token vs dedicated test token vs mock + short soak | |
| Failure posture + halt signal | Hard halts, halt artifact, pass artifact, kill-switch | ✓ |
| Spike exporter shape | Bash+curl vs Python prototype, host location, egress mechanics, schema validation | ✓ |

---

## Area 1: Quota Source Approach

### Q1.1 — Which quota source approach?

| Option | Description | Selected |
|--------|-------------|----------|
| Endpoint-scrape (primary) | Exporter calls /api/oauth/usage directly. Matches current REQUIREMENTS. ToS-adjacent. | ✓ |
| Local log tail (ccusage) | Per-worker agent reads Claude Code local logs. ToS-clean but invalidates TOKEN-*/EXP-*. | |
| Hybrid | Endpoint primary + ccusage fallback. Highest complexity. | |
| You decide | Claude picks post-soak. | |

**User's choice:** Endpoint-scrape — with free-text note: "do not use local log, only what actually would be returned by /usage, find a way to get same data with only a auth token"
**Notes:** Hard constraint: auth-token-only approach. No dependency on Claude Code local files. Research must probe whether API-key auth reaches /usage (captured as research task in CONTEXT.md D-05-02).

### Q1.2 — ADR D-07 ToS interpretation?

| Option | Description | Selected |
|--------|-------------|----------|
| In-scope: monitor own quotas | User considers monitoring-own-CC-tokens legitimate self-observability. | |
| Ambiguous — proceed carefully | ToS unclear; add kill-switch, self-throttle, halt on persistent 401/429. | ✓ |
| Prohibited — abandon endpoint-scrape | Rewrite REQUIREMENTS, switch to ccusage. | |

**User's choice:** Ambiguous — proceed carefully
**Notes:** Defensive posture adopted. ADR D-07 must enumerate weighed ToS clauses + conditions that would flip the verdict.

### Q1.3 — Soak token source?

| Option | Description | Selected |
|--------|-------------|----------|
| Fresh `claude setup-token` on mcow | Matches production path, validates SOPS+mcow flow early. | |
| Reuse existing operator token | Saves rotation friction, couples soak to token's remaining lifetime. | ✓ |
| Out of scope for feasibility | Hardcode token in 600-perm env, rm post-soak. | |

**User's choice:** Reuse existing operator token
**Notes:** ADR D-07 must capture which operator's token + date of soak (scoping evidence validity).

### Q1.4 — Soak cadence?

| Option | Description | Selected |
|--------|-------------|----------|
| 300s ±60s (per ROADMAP) | Matches Phase 05 success criterion verbatim. | ✓ |
| 60s ±10s (stress-test) | Higher fingerprint risk per A-03. | |
| 900s ±120s (safer) | <2 data points per 5h session reset. | |

**User's choice:** 300s ±60s jitter
**Notes:** Spec-aligned; ~288 requests over 24h.

---

## Area 2: Failure Posture + Halt Signal

### Q2.1 — Which failures HALT v2.0? (multiSelect)

| Option | Description | Selected |
|--------|-------------|----------|
| Egress blocked (curl fails) | MON-02/MON-03 unsatisfiable | ✓ |
| Auth fails (401/403 persistent) | Kills endpoint-scrape entirely | ✓ |
| Schema mismatch | Halt until research finds new schema | |
| ≥5% 429 rate | Rework tuning | |

**User's choice:** Egress blocked + persistent 401/403
**Notes:** Schema mismatch and 429 rate classified as soft halts (rework signals, not milestone kills).

### Q2.2 — Halt artifact?

| Option | Description | Selected |
|--------|-------------|----------|
| GATE-FAILED.md in phase dir | AI-readable, repo-local, STATE.md → blocked | ✓ |
| PROJECT.md annotation only | Lightweight | |
| Just fail soak + stop | No artifact | |

**User's choice:** GATE-FAILED.md
**Notes:** Document-first principle.

### Q2.3 — Pass artifact?

| Option | Description | Selected |
|--------|-------------|----------|
| GATE-PASSED.md + soak evidence | Reviewable without re-soak; ADR link | ✓ |
| ADR D-07 alone | Minimal proof | |
| VERIFICATION.md via /gsd-verify-work | Standard GSD artifact, over-structured here | |

**User's choice:** GATE-PASSED.md + soak evidence
**Notes:** Evidence: request count, 429 count, latency stats, 3+ full response samples, curl transcripts, ADR D-07 link.

### Q2.4 — Runtime kill-switch?

| Option | Description | Selected |
|--------|-------------|----------|
| SCRAPE_ENABLED env var | Simple, auditable in git | |
| SIGUSR1 stop-polling signal | No restart, more complex | |
| Defer to Phase 06 planning | Not a feasibility-gate concern | ✓ |

**User's choice:** Defer to Phase 06
**Notes:** Correctly separates feasibility proof from runtime ops.

---

## Area 3: Spike Exporter Shape

### Q3.1 — Spike form?

| Option | Description | Selected |
|--------|-------------|----------|
| Bash + curl + jq in systemd timer | Disposable, zero language commitment | ✓ |
| Python + httpx prototype | Phase 06 seed; premature commitment | |
| Plain systemd + curl (no jq) | Post-hoc validation only | |

**User's choice:** Bash + curl + jq + systemd timer
**Notes:** Disposable. Systemd units removed + log archived post-soak.

### Q3.2 — Spike host?

| Option | Description | Selected |
|--------|-------------|----------|
| mcow (real target) | Exercises MON-02/MON-03 end-to-end | ✓ |
| cc-worker (known-working egress) | Decouples endpoint from egress feasibility | |
| Parallel both hosts | Ruled out by single-token constraint | |

**User's choice:** mcow
**Notes:** Catches egress failure at cheapest layer.

### Q3.3 — App Connector advertisement method?

| Option | Description | Selected |
|--------|-------------|----------|
| Extend existing App Connector | Reuses proven Telegram-CIDR pattern | ✓ |
| New dedicated connector | Cleaner blast radius, more infra | |
| Plain --advertise-routes with static CIDRs | Cloudflare-fronted IPs drift (A-04 risk) | |

**User's choice:** Extend existing App Connector
**Notes:** tag:connector + ACL nodeAttrs + --accept-routes pattern already validated for Telegram egress.

### Q3.4 — Schema validation method?

| Option | Description | Selected |
|--------|-------------|----------|
| Hash-of-keys sample (3+) | Detects drift; cheap | ✓ |
| JSON Schema file + ajv/jsonschema | Rigorous but brittle on transient shifts | |
| Hand-inspect 3 responses | v1.0 G-04 lesson argues against | |

**User's choice:** Hash-of-keys sample
**Notes:** Post-soak assertion: ≥3 distinct samples share the same sorted-JSON-key hash AND each contains required fields.

---

## Closing Question

### Q-final — Ready for context?

| Option | Description | Selected |
|--------|-------------|----------|
| Ready for context | Write CONTEXT.md now | ✓ |
| Explore more | Dig into ADR scope / sample storage / RNG / SOPS / User-Agent | |

**User's choice:** Ready for context

---

## Claude's Discretion

Captured in CONTEXT.md `<decisions>` §`Claude's Discretion`:
- Jitter RNG method (prefer systemd `RandomizedDelaySec`)
- JSONL row shape (required fields enumerated)
- curl User-Agent (`claude-usage-soak/0.1` default; research may refine)
- systemd unit file location (prefer system unit)
- Teardown script format
- Exact schema-hash implementation (SHA-256 of canonical JSON suggested)

## Deferred Ideas

Captured in CONTEXT.md `<deferred>`:
- Fresh `claude setup-token` on mcow (revisit Phase 08)
- Python prototype as Phase 06 seed
- Parallel soak on multiple hosts
- Runtime kill-switch (Phase 06)
- JSON Schema file validation (Phase 06 maybe)
