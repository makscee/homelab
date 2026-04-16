# Domain Pitfalls

**Domain:** Next.js 15 / Bun admin dashboard — homelab context (Tailnet-only, Proxmox/SOPS/Prometheus integrations, AI-agent primary developer)
**Researched:** 2026-04-16
**Milestone:** v3.0 Unified Stack Migration

---

## Critical Pitfalls

Mistakes that cause rewrites, security incidents, or block the milestone.

---

### P-01: RSC Flight Protocol RCE (CVE-2025-66478 / CVE-2025-55182)
**Severity:** HIGH — active exploitable CVE in Next.js app router
**What goes wrong:** React Server Components' Flight protocol in Next.js ≥14.3.0-canary.77 through unpatched 15.x allows unauthenticated RCE via a crafted HTTP request to any Server Action endpoint. No login required; network access to the port is sufficient. Even a Tailnet-only bind is not a full mitigation — any compromised Tailnet node can reach mcow:443.
**Why it happens:** Logically insecure deserialization in the RSC payload handler; server fails to validate structure before executing server-side logic.
**Prevention:** Pin Next.js to a patched release (15.5.7 / 15.4.8 / 15.3.6 / 15.2.6 or newer). Add `bun audit` as a pre-deploy check. Never run a Next.js 15 version below the patched floor.
**Detection:** `bun audit` flags the package version; check NVD for CVE-2025-66478 before pinning.
**Owning phase:** Phase 1 (scaffold) — pin version on day 0. Security review phase — re-audit before launch.
**Sources:** [Next.js Security Update Dec 2025](https://nextjs.org/blog/security-update-2025-12-11), [CVE-2025-66478](https://nextjs.org/blog/CVE-2025-66478), [Praetorian working exploit](https://www.praetorian.com/blog/critical-advisory-remote-code-execution-in-next-js-cve-2025-66478-with-working-exploit/)

---

### P-02: Tailscale Header Spoofing — Loopback Trust Boundary
**Severity:** HIGH — auth bypass if proxy is misconfigured
**What goes wrong:** The Tailscale Serve proxy strips and re-injects `Tailscale-User-Login` / `Tailscale-User-Name` headers from authenticated Tailnet connections. But if the Next.js app is exposed on any loopback interface (127.0.0.1) without Tailscale Serve in front, any process on mcow can inject those headers and impersonate any Tailnet user. A documented real-world variant caused a privilege escalation in a Grafana Tailscale proxy that failed to strip `X-Webauth-*` headers.
**Why it happens:** Applications trust headers at face value without verifying the request actually arrived through the Tailscale daemon.
**Prevention:**
1. Bind the Next.js app to loopback only; expose exclusively through `tailscale serve` — never directly on the Tailnet IP without the proxy.
2. In middleware, validate that `X-Forwarded-For` resolves to a known Tailnet IP range (100.x.x.x) — reject anything outside that range.
3. For sensitive mutating actions (token write, LXC stop), use `tailscale whois <IP>` via child process to re-verify identity server-side, not just the header value.
**Detection:** Integration test — send request with forged `Tailscale-User-Login` header directly to the loopback port; middleware must reject it with 401.
**Owning phase:** Phase 1 (auth middleware scaffold). Security review phase.
**Sources:** [Tailscale security bulletins](https://tailscale.com/security-bulletins), [OpenClaw Tailscale whois pattern](https://github.com/openclaw/openclaw/issues/13153), [Tailscale Serve header stripping docs](https://tailscale.com/docs/features/tailscale-serve)

---

### P-03: RSC / App Router Secret Leak to Client Bundle
**Severity:** HIGH — silent; no runtime error
**What goes wrong:** An AI agent writing a React Server Component imports a module that references `process.env.SOPS_AGE_KEY` or reads a decrypted token registry. If the import graph is not cleanly server-only, Next.js bundles that value into client JS. The agent cannot see the browser network tab — it will not detect the leak.
**Why it happens:** Next.js 15 app router allows `import 'server-only'` to guard modules, but agents routinely skip this. Any file reachable from a `use client` component that imports a secret-touching module will be bundled client-side.
**Prevention:**
1. All SOPS access, age key reads, Proxmox API calls, and token registry logic MUST live in files that begin with `import 'server-only'`.
2. Lint rule: enforce `server-only` import in any file under `lib/secrets/`, `lib/proxmox/`, `lib/tokens/`.
3. Agent prompt scaffolding: "server-only imports are mandatory for any file touching secrets or external APIs."
**Detection:** `NEXT_PUBLIC_*` env var audit + `next build` bundle analysis via `@next/bundle-analyzer`. Run as part of security review.
**Owning phase:** Phase 1 (scaffold) — establish the convention. Code review gate on every agent-written server module.
**Sources:** [Next.js server-only docs](https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns#keeping-server-only-code-out-of-the-client-environment)

---

### P-04: node-pty Native Build Failure in Proxmox LXC (PTY Allocation)
**Severity:** HIGH — web terminal feature completely blocked if not validated first
**What goes wrong:** `node-pty` requires a native compile with `node-gyp`. In a Proxmox unprivileged LXC container, PTY device allocation (`/dev/pts`) may be restricted by the container's kernel capabilities. The symptom is a hard build failure or a runtime `TIOCGPTPEER ioctl: Inappropriate ioctl for device` error. Even when the build succeeds, the PTY may silently fail to open.
**Why it happens:** Unprivileged LXC containers lack `CAP_SYS_ADMIN` by default; `/dev/pts` namespace operations may be blocked depending on the Proxmox host kernel version and LXC config.
**Prevention:**
1. Before writing any xterm.js code: SSH into mcow and run `python3 -c "import pty; pty.spawn('/bin/bash')"` — if this fails, LXC PTY is broken at OS level.
2. Check `lxc.cap.drop` in the mcow LXC config on tower; ensure it does not drop `sys_admin` for PTY mux.
3. Build node-pty on the target LXC (mcow), not on dev machine — prebuilds may not match kernel/glibc.
4. Alternative if PTY fails: use `ssh2` library (pure JS, no native build) and pipe stdio to xterm.js — avoids node-pty entirely. This is the recommended fallback.
**Detection:** Feasibility spike on mcow: `npm install node-pty && node -e "const pty = require('node-pty'); pty.spawn('bash', [], {})"` before committing to the xterm approach.
**Owning phase:** Web terminal phase — feasibility spike must be first task.
**Sources:** [LXC PTY allocation issue](https://discuss.linuxcontainers.org/t/solved-unable-to-start-lxc-container-operation-not-permitted-failed-to-allocate-a-pty/219), [node-pty non-context-aware native module #405](https://github.com/microsoft/node-pty/issues/405), [VS Code remote missing node-pty](https://github.com/microsoft/vscode-remote-release/issues/11275)

---

### P-05: Bun Runtime — Native Module Incompatibility (sharp, node-pty, better-sqlite3)
**Severity:** HIGH for affected modules; LOW for pure-JS stack
**What goes wrong:** Bun supports Node-API (napi) modules but not all native addons work cleanly. The three most relevant: (1) `sharp` — Next.js 15 uses sharp for image optimization; under Bun the prebuilt binary may fail to load. (2) `node-pty` — see P-04. (3) `better-sqlite3` — requires a matching napi prebuilt for the host ABI; Bun's native `bun:sqlite` is the correct alternative.
**Why it happens:** Bun uses a different internal module loading path than Node; prebuilds compiled for Node ABI versions may not match Bun's ABI.
**Prevention:**
1. Use `bun install` + `bun run dev/build` for DX speed; keep `node` as the production runtime for `next start` until the specific native modules are verified on Bun in the target LXC.
2. If `bun start` is preferred: test `sharp` and any SQLite lib on mcow under Bun before committing.
3. Use `bun:sqlite` instead of `better-sqlite3` — eliminates one native dep entirely.
4. Set `serverExternalPackages: ['node-pty', 'sharp']` in `next.config.ts` so Next.js does not attempt to bundle them.
**Detection:** `bun run build && bun start` on mcow — watch for `Error: dlopen failed` in startup logs.
**Owning phase:** Phase 1 (scaffold) — validate runtime choice on mcow before any feature work.
**Sources:** [Bun compatibility 2026](https://www.alexcloudstar.com/blog/bun-compatibility-2026-npm-nodejs-nextjs/), [Next.js + Bun guide](https://bun.com/docs/guides/ecosystem/nextjs), [JS runtimes forked 2025](https://debugg.ai/resources/js-runtimes-have-forked-2025-cross-runtime-libraries-node-bun-deno-edge-workers)

---

### P-06: Proxmox API — Self-Signed TLS + `NODE_TLS_REJECT_UNAUTHORIZED=0` Anti-Pattern
**Severity:** HIGH (security) / MED (availability)
**What goes wrong:** Proxmox VE creates a self-signed CA by default. `fetch()` / Bun's `fetch` reject connections to `https://tower:8006` with a cert error. The "quick fix" is `process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"`, which disables cert validation globally for the entire process — including outbound calls to Anthropic, Cloudflare, and Prometheus.
**Why it happens:** Setting the env var is one line; pinning the Proxmox CA cert requires extracting it and configuring a custom `ca` option per `fetch` call.
**Prevention:**
1. Extract the Proxmox node CA cert: `ssh root@tower "cat /etc/pve/pve-root-ca.pem"` — commit to `config/proxmox-ca.pem` (not SOPS-encrypted; it is a public CA cert).
2. Build a dedicated Proxmox client helper that injects `ca: fs.readFileSync('proxmox-ca.pem')` via a custom `tls.createSecureContext` — never set `NODE_TLS_REJECT_UNAUTHORIZED`.
3. CI lint rule: grep for `REJECT_UNAUTHORIZED` in source files; fail if present.
**Detection:** Lint rule enforced in CI.
**Owning phase:** Proxmox integration phase.
**Sources:** [Proxmox cert management wiki](https://pve.proxmox.com/wiki/Certificate_Management), [terraform-provider-proxmox self-signed cert issue #1609](https://github.com/bpg/terraform-provider-proxmox/issues/1609)

---

## Moderate Pitfalls

Cause bugs, data loss, or subtle security holes — not blockers but painful to fix post-launch.

---

### P-07: Proxmox Long-Running Tasks — Treating Task UPID as Synchronous Result
**Severity:** MED — UI shows wrong state; operator may act on stale data
**What goes wrong:** Proxmox API calls for `POST /nodes/{node}/lxc/{vmid}/status/start`, clone, stop, etc. return an UPID task ID string, not a completion status. If the dashboard reads `GET /nodes/{node}/lxc/{vmid}/status/current` immediately after posting, it reads stale "stopped" state and may display a false error or allow a double-start.
**Prevention:** After every mutating Proxmox call, poll `GET /nodes/{node}/tasks/{upid}/status` until `status === "stopped"` and `exitstatus === "OK"`, with a configurable timeout. Display a "pending" state in the UI while polling.
**Owning phase:** Proxmox ops page.

---

### P-08: SOPS Decrypted Plaintext in Stack Traces / Error Responses
**Severity:** MED — secrets leak to logs or API 500 JSON
**What goes wrong:** A server action calls `sops -d registry.sops.yaml`, parses it, and if parsing throws (malformed YAML, wrong schema), the error message may contain decrypted content in the stack trace. If that error propagates as a 500 JSON response, the secret reaches the browser.
**Prevention:**
1. Wrap all SOPS decrypt + parse in a try/catch that logs `"SOPS decode failed"` (no detail) and throws a generic `new Error("registry unavailable")` — never re-throw the original error.
2. In Next.js, ensure `error.tsx` never renders `error.message` for server action errors — use a fixed user-facing string.
3. Never log the `data` object from a SOPS-decrypted file at any log level.
**Owning phase:** SOPS / token registry phase.

---

### P-09: age Key File Permissions — Silent Decrypt Failure
**Severity:** MED — all SOPS operations break silently with a cryptic error
**What goes wrong:** The age key file at `/root/.config/sops/age/keys.txt` (or equivalent) must be readable by the process user. If the dashboard runs as uid 65534 (target for hardening) but the age key is `root`-only (`0600 root`), all SOPS decrypts fail with "no matching key" — not a permissions error — making diagnosis non-obvious.
**Prevention:**
1. Deploy the age key with `install -m 0400 -o admin-dashboard -g admin-dashboard` for any non-root process.
2. Ansible task: `ansible.builtin.file: path: /etc/sops/age/keys.txt mode: '0400' owner: admin-dashboard`.
3. Add a startup health check in the app that calls `sops -d` on a test fixture at boot and exits with a clear error if it fails.
**Owning phase:** Ansible deploy playbook phase.

---

### P-10: PromQL Injection via User-Controlled Metric Name or Label Input
**Severity:** MED — exposes arbitrary Prometheus metrics to any Tailnet user
**What goes wrong:** If the dashboard lets users enter a metric name or label value interpolated directly into a PromQL string (e.g. `` `up{job="${userInput}"}` ``), an attacker can escape the string and run arbitrary PromQL against the Prometheus instance. The official Prometheus security model explicitly warns about this.
**Prevention:**
1. Never interpolate user input into PromQL strings.
2. Use a server-side allowlist of metric names and label values; reject anything not on the list before building the query.
3. If dynamic exploration is needed, use Prometheus HTTP API's label-names / label-values endpoints to enumerate and validate — never freeform.
**Owning phase:** Prometheus dashboard page.
**Sources:** [Prometheus security model](https://prometheus.io/docs/operating/security/), [PromQL injection discussion #15430](https://github.com/prometheus/prometheus/discussions/15430)

---

### P-11: Prometheus Scrape Staleness — Agent Thinks Metric Is Missing (5m Stale Window)
**Severity:** MED for AI agents specifically; LOW for humans
**What goes wrong:** Prometheus marks a time series stale if no sample arrives within ~5 minutes after the last scrape. If the Claude Code exporter on mcow:9101 restarts, `claude_usage_*` metrics disappear from Prometheus for up to 5 minutes. An AI agent writing dashboard logic may hard-code "metric not found = error" and alert or attempt remediation when the stale window occurs naturally.
**Prevention:**
1. Dashboard must distinguish between `no data` (stale series) and a zero value — use `absent(metric)` in PromQL for absence detection; return a "no data" state indicator, not an error.
2. Add `up{job="claude-usage"}` to the dashboard as the primary health indicator — show it prominently.
3. Agent coding prompt: "A missing Prometheus metric for up to 5 minutes after an exporter restart is expected behavior — check `up{job=...}` first."
**Owning phase:** Claude Tokens page.

---

### P-12: PTY Zombie Processes on Browser Disconnect
**Severity:** MED — resource leak accumulates on mcow
**What goes wrong:** When a browser tab closes, the WebSocket disconnect event fires on the server. If the handler does not explicitly call `ptyProcess.kill()` and clean up the SSH session, the spawned shell continues running as an orphan. An AI agent who wrote the WebSocket handler without a `close` event listener will silently leave zombies.
**Prevention:**
1. WebSocket server: `ws.on('close', () => { ptyProcess.kill(); session.end(); })` — mandatory, not optional.
2. Add a periodic cleanup that lists open PTY sessions and kills any older than a configured idle timeout (belt + suspenders).
3. Agent checklist: "Does your WebSocket handler have a `close` cleanup block? Show it."
**Owning phase:** Web terminal phase.
**Sources:** [xterm.js flowcontrol guide](https://xtermjs.org/docs/guides/flowcontrol/), [xterm.js WebSocket heartbeats issue #1301](https://github.com/xtermjs/xterm.js/issues/1301)

---

### P-13: WebSocket Backpressure — High-Throughput Terminal Output
**Severity:** MED — OOM or connection drop under sustained output
**What goes wrong:** If a user runs `cat largefile` or any high-throughput command in the web terminal, the PTY produces data faster than the WebSocket can drain. Without backpressure, the server buffers unboundedly until OOM or the connection drops. xterm.js has no built-in flow control for WebSocket transports.
**Prevention:**
1. Implement XON/XOFF flow control: pause PTY reads when `ws.bufferedAmount > threshold`; resume when drained.
2. Set a max buffer size on the WebSocket server; drop the connection (with a user-visible warning) if exceeded rather than silently OOMing.
3. Verify whether `xterm-addon-attach` actually applies backpressure for the Bun WS server before relying on it.
**Owning phase:** Web terminal phase.
**Sources:** [xterm.js flowcontrol docs](https://xtermjs.org/docs/guides/flowcontrol/), [Backpressure in WebSocket Streams](https://skylinecodes.substack.com/p/backpressure-in-websocket-streams)

---

### P-14: LE DNS-01 Renewal Hook Silently Fails — Cert Expires 90 Days Post-Launch
**Severity:** MED — `homelab.makscee.ru` goes HTTPS-broken with no alert
**What goes wrong:** Certbot / acme.sh renewal runs on a systemd timer. If the Cloudflare API token is rotated, age key perms change, or the hook script exits non-zero, the renewal silently fails. Because it is a systemd timer (not a daemon), there is no persistent failure log unless explicitly configured. Real-world reports confirm certbot failing silently for weeks with no alert.
**Prevention:**
1. Deploy-hook that sends a Telegram message on successful renewal. Separate `OnFailure=` systemd unit that alerts on renewal failure.
2. Add a Prometheus alert rule: `ssl_cert_expiry_days < 14` using `blackbox_exporter` or a simple curl-based check.
3. Test renewal before launch: `acme.sh --renew --force` or `certbot renew --dry-run`.
4. Cloudflare API token needs minimum `Zone:DNS:Edit` scope — document in Ansible vars, not hardcoded.
**Owning phase:** TLS / Caddy deploy phase.
**Sources:** [SSL auto-renewal silent failure (ZeonEdge)](https://zeonedge.com/blog/ssl-certbot-auto-renewal-failing-silently-fix), [acme.sh Cloudflare propagation issues (LE Community)](https://community.letsencrypt.org/t/acme-sh-cloudflare-timeouts-and-error-getting-validation-data/183999)

---

### P-15: systemd `PrivateTmp=yes` and `ProtectSystem=strict` Fail in Proxmox LXC
**Severity:** MED — service fails to start with cryptic `Operation not permitted`
**What goes wrong:** systemd hardening directives `PrivateTmp=yes`, `ProtectSystem=strict`, and `PrivateDevices=yes` require kernel namespace capabilities restricted in unprivileged LXC containers. The service unit fails to start or produces mount errors. This is a known long-standing issue (Ubuntu bug #1346734) and remains relevant on Proxmox LXC in 2024.
**Prevention:**
1. For the admin dashboard service unit, limit hardening to `NoNewPrivileges=yes` + `User=` + `Group=` — avoid `PrivateTmp`, `ProtectSystem=strict`, `PrivateDevices`.
2. Validate the unit on mcow before committing to Ansible: `systemd-analyze verify /etc/systemd/system/homelab-admin.service`.
3. If mcow is a privileged LXC container, some directives may work — test empirically; do not assume.
**Owning phase:** Ansible systemd deploy phase.
**Sources:** [Ubuntu bug #1346734 — PrivateTmp in unprivileged LXC](https://bugs.launchpad.net/ubuntu/+source/systemd/+bug/1346734), [LXC unpriv container fail issue #4347](https://github.com/lxc/lxc/issues/4347)

---

## AI-Agent-Specific Pitfalls

Patterns that human developers catch by intuition but autonomous agents reliably miss.

---

### P-16: Agent Writes `"use client"` on a Component That Imports a Server-Only Module
**Severity:** HIGH — agent-specific trigger for P-03
**What goes wrong:** An agent building the token registry UI writes a single component file with both `"use client"` (for interactivity) and `import { readTokenRegistry } from '../lib/tokens/registry'`. The build succeeds in dev mode but leaks SOPS-decrypted token data in the production bundle.
**Prevention:** Scaffolding rule established in Phase 1: all data-fetching must be in a Server Component parent that passes serialized data as props to a `"use client"` child. Agent prompt must include: "Never import a server-only lib from a `use client` file — use props or server actions instead."
**Owning phase:** Phase 1 scaffold + code review gate every subsequent phase.

---

### P-17: Agent Does Not Commit `bun.lockb` — Floating Versions Break Next Deploy
**Severity:** MED — build breaks on next `bun install` after agent-generated `package.json`
**What goes wrong:** Agent uses `bun add some-lib` which writes `"some-lib": "^2.3.0"`. Later, `^2.3.0` resolves to `2.4.0` which has a breaking API change. Without a committed lockfile, the next `bun install` (by another agent session or Ansible deploy) fetches the newer version and breaks.
**Prevention:** Always commit `bun.lockb`. In Ansible deploy playbook: `bun install --frozen-lockfile`. Agent prompt: "After any dependency change, commit both `package.json` and `bun.lockb` in the same commit."
**Owning phase:** Phase 1 scaffold (lockfile policy). Deploy phase (frozen-lockfile flag in playbook).

---

### P-18: Agent Omits Zod Validation on Server Action Input
**Severity:** MED — TypeScript happy, runtime unsafe; path traversal possible on SOPS or Proxmox ops
**What goes wrong:** Agent writes `async function rotateToken(tokenName: string)`. TypeScript types the parameter, but Next.js server actions receive serialized form values at runtime with no automatic validation. The agent passes `tokenName` directly to `execSync(`sops -d ${tokenName}.sops.yaml`)` — path traversal (`../../etc/passwd`) is possible.
**Prevention:** All server action inputs MUST be validated with Zod before any filesystem, Proxmox, or SOPS operation. Define the Zod schema first, then the action body. Agent checklist: "Is there a `z.parse()` call at the top of every server action that touches external resources?"
**Owning phase:** All feature phases — enforce via code review checklist.

---

### P-19: Agent Uses Too-Short `rate()` Window for 300s-Interval Exporter Metrics
**Severity:** LOW-MED — wrong graphs; may cause agent to "fix" a working exporter
**What goes wrong:** The Claude Code exporter scrapes at 300s intervals. If the agent writes a dashboard panel using `rate(claude_usage_poll_success_total[1m])`, the 1-minute window contains 0 or 1 sample, making `rate()` return 0 or a meaningless spike. The agent, seeing a flat graph, may assume the exporter is broken and attempt remediation.
**Prevention:** For metrics scraped at 5-minute intervals, use range vectors of at least `[10m]` — ideally `[15m]`. Document the scrape interval as a visible dashboard label. Agent prompt: "Use range windows at least 2x the scrape interval. The claude-usage exporter scrapes every 300s."
**Owning phase:** Claude Tokens page.

---

### P-20: Agent Uses Proxmox `/stop` (Hard Kill) Instead of `/shutdown` (Graceful)
**Severity:** MED — potential filesystem corruption on running LXC (SQLite on mcow)
**What goes wrong:** The Proxmox API has two stop operations: `POST .../status/stop` (hard stop — pulls power) and `POST .../status/shutdown` (graceful ACPI). An agent implementing an "LXC stop" button uses `/stop` (the obvious name) and hard-kills the container, potentially corrupting SQLite databases inside.
**Prevention:** UI must default to `shutdown` with a configurable timeout. `/stop` (force) available only behind an explicit "Force stop" confirmation dialog. The Proxmox ops phase plan must call this out explicitly.
**Owning phase:** Proxmox ops page.

---

## Phase-Specific Warnings Summary

| Phase Topic | Pitfall | Mitigation |
|-------------|---------|------------|
| Scaffold (Phase 1) | P-01 RSC CVE, P-02 Tailscale headers, P-03 RSC secret leak, P-05 Bun native modules | Pin Next.js version; validate on mcow; establish `server-only` convention; validate runtime |
| Auth middleware | P-02 header spoofing | Bind to loopback + tailscale serve only; validate X-Forwarded-For Tailnet range |
| Prometheus page | P-10 PromQL injection, P-11 stale metrics, P-19 rate() window | Allowlist metric names; use `absent()`; correct range vectors (≥10m) |
| SOPS / token registry | P-08 plaintext in errors, P-09 age key perms, P-18 Zod validation | Wrap SOPS calls; Ansible perms; Zod on all server actions |
| Proxmox ops page | P-06 self-signed TLS, P-07 async task IDs, P-20 stop vs shutdown | Pin CA cert; poll UPID status; default to graceful shutdown |
| Web terminal | P-04 node-pty LXC, P-12 zombie PTY, P-13 backpressure | Feasibility spike first; mandatory close handler; XON/XOFF or buffer limit |
| TLS / Caddy deploy | P-14 silent cert renewal | Renewal Telegram alert + Prometheus cert expiry rule |
| Systemd deploy | P-15 PrivateTmp in LXC, P-17 lockfile | Avoid restrictive sandbox opts; frozen-lockfile in Ansible |
| All agent-written code | P-16 use client leak, P-17 lockfile, P-18 Zod, P-20 stop vs shutdown | Code review checklist enforced per phase plan |

---

## Sources

- [Next.js CVE-2025-66478 advisory](https://nextjs.org/blog/CVE-2025-66478)
- [React RSC critical vulnerability blog](https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components)
- [Tailscale security bulletins](https://tailscale.com/security-bulletins)
- [Tailscale Serve docs (header injection)](https://tailscale.com/docs/features/tailscale-serve)
- [OpenClaw Tailscale whois spoofing issue #13153](https://github.com/openclaw/openclaw/issues/13153)
- [Prometheus security model](https://prometheus.io/docs/operating/security/)
- [prometheus/prometheus PromQL injection discussion #15430](https://github.com/prometheus/prometheus/discussions/15430)
- [LXC PTY allocation issue](https://discuss.linuxcontainers.org/t/solved-unable-to-start-lxc-container-operation-not-permitted-failed-to-allocate-a-pty/219)
- [node-pty non-context-aware native module #405](https://github.com/microsoft/node-pty/issues/405)
- [VS Code remote missing node-pty issue](https://github.com/microsoft/vscode-remote-release/issues/11275)
- [Bun compatibility 2026 — native modules](https://www.alexcloudstar.com/blog/bun-compatibility-2026-npm-nodejs-nextjs/)
- [Proxmox certificate management wiki](https://pve.proxmox.com/wiki/Certificate_Management)
- [terraform-provider-proxmox self-signed cert issue #1609](https://github.com/bpg/terraform-provider-proxmox/issues/1609)
- [acme.sh Cloudflare propagation issues (LE Community)](https://community.letsencrypt.org/t/acme-sh-cloudflare-timeouts-and-error-getting-validation-data/183999)
- [SSL auto-renewal silent failure (ZeonEdge)](https://zeonedge.com/blog/ssl-certbot-auto-renewal-failing-silently-fix)
- [Ubuntu bug #1346734 — PrivateTmp in unprivileged LXC](https://bugs.launchpad.net/ubuntu/+source/systemd/+bug/1346734)
- [xterm.js flowcontrol guide](https://xtermjs.org/docs/guides/flowcontrol/)
- [Backpressure in WebSocket Streams](https://skylinecodes.substack.com/p/backpressure-in-websocket-streams)
- [SOPS official docs](https://getsops.io/docs/)
