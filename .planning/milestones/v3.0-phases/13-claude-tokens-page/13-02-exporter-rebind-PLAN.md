---
phase: 13
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - ansible/playbooks/deploy-claude-usage-exporter.yml
  - servers/mcow/systemd/claude-usage-exporter.service
  - servers/mcow/claude-usage-exporter/exporter.py
  - servers/mcow/claude-usage-exporter/test_exporter.py
  - servers/mcow/claude-usage-exporter/README.md
  - ansible/group_vars/all.yml
autonomous: false
requirements:
  - SEC-03
  - TOKEN-01
user_setup: []
tags:
  - exporter
  - ansible
  - security
  - tech-debt

must_haves:
  truths:
    - "curl http://100.101.0.9:9101/metrics from outside Tailnet fails (connection refused or timeout)"
    - "curl http://100.101.0.9:9101/metrics from a Tailnet host returns valid Prometheus exposition"
    - "ps -o uid -p $(pgrep -f claude-usage-exporter) prints 65534"
    - "Exporter reloads decrypted registry within 60s of mtime change without restart"
    - "Ansible playbook is idempotent: second run reports zero changed tasks"
  artifacts:
    - path: "servers/mcow/systemd/claude-usage-exporter.service"
      provides: "Systemd unit: User=nobody, hardened, bound to 100.101.0.9:9101"
      contains: "User=nobody"
    - path: "servers/mcow/claude-usage-exporter/exporter.py"
      provides: "Python exporter with mtime-poll registry reload every 30s"
    - path: "ansible/playbooks/deploy-claude-usage-exporter.yml"
      provides: "Idempotent deploy: render unit, rsync source, decrypt registry to nobody-readable path, restart"
  key_links:
    - from: "exporter.py"
      to: "/var/lib/claude-usage-exporter/claude-tokens.json"
      via: "mtime poll every 30s"
      pattern: "st_mtime"
    - from: "claude-usage-exporter.service"
      to: "100.101.0.9:9101"
      via: "--bind-address flag"
      pattern: "100\\.101\\.0\\.9"
---

<objective>
Pay the v2.0 exporter tech-debt (SEC-03) before the UI surfaces the registry: rebind `claude-usage-exporter` from `0.0.0.0:9101` to `100.101.0.9:9101`, drop privileges to uid 65534 (nobody), and add file-mtime-based registry reload so admin-app SOPS writes take effect within 60s without Ansible redeploy (D-13-07).

Purpose: Phase 13 UI will write to SOPS and expect gauges to appear within one poll cycle. The exporter must reload without operator re-running the playbook after every mutation.
Output: Hardened exporter, hot-reload capability, Tailnet-only bind, idempotent playbook, deployed + verified.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/13-claude-tokens-page/13-CONTEXT.md
@ansible/group_vars/all.yml
@ansible/inventory.ini
@servers/mcow/systemd/claude-usage-exporter.service
@servers/mcow/claude-usage-exporter/exporter.py
@ansible/playbooks/deploy-claude-usage-exporter.yml

<interfaces>
<!-- Registry JSON shape the exporter consumes — matches Plan 13-01 TokenRegistry (D-13-13). -->

Exporter read path (decrypted, nobody-readable):
`/var/lib/claude-usage-exporter/claude-tokens.json`

JSON shape:
```json
{
  "tokens": [
    {
      "id": "uuid",
      "label": "makscee-personal",
      "value": "sk-ant-oat01-...",
      "tier": "pro",
      "owner_host": "cc-worker",
      "enabled": true,
      "added_at": "2026-04-17T00:00:00Z"
    }
  ]
}
```

Metric names (match exactly — consumed by Plan 13-03 `prometheus.server.ts` and Plan 13-04 UI):
- `claude_usage_5h_pct{label,tier,owner_host}` gauge (0-100)
- `claude_usage_7d_pct{label,tier,owner_host}` gauge (0-100)
- `claude_usage_reset_seconds{label,window}` gauge (window = "five_hour" | "seven_day")
- `claude_usage_poll_last_success_timestamp{label}` gauge
- `claude_usage_api_errors_total{label,status}` counter
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rebind exporter to Tailnet-only + drop privileges in systemd unit</name>
  <files>servers/mcow/systemd/claude-usage-exporter.service, ansible/group_vars/all.yml</files>
  <read_first>
    - servers/mcow/systemd/claude-usage-exporter.service (current User= and ExecStart= lines)
    - servers/mcow/systemd/homelab-admin.service (Phase 12 strict hardening reference)
    - ansible/group_vars/all.yml (current exporter variables)
    - .planning/phases/13-claude-tokens-page/13-CONTEXT.md §D-13-14
  </read_first>
  <action>
    1. Edit `ansible/group_vars/all.yml`. Add or replace the exporter block with:
       ```yaml
       claude_usage_exporter:
         bind_address: 100.101.0.9
         port: 9101
         user: nobody
         group: nogroup
         read_path: /var/lib/claude-usage-exporter/claude-tokens.json
         state_dir: /var/lib/claude-usage-exporter
         install_dir: /opt/claude-usage-exporter
         poll_interval: 300
         reload_interval: 30
       ```

    2. Rewrite `servers/mcow/systemd/claude-usage-exporter.service` to the exact content below:
       ```
       [Unit]
       Description=Claude Code Usage Exporter (Prometheus)
       After=network-online.target
       Wants=network-online.target

       [Service]
       Type=simple
       User=nobody
       Group=nogroup
       ExecStart=/usr/bin/python3 /opt/claude-usage-exporter/exporter.py --bind-address 100.101.0.9 --port 9101 --registry /var/lib/claude-usage-exporter/claude-tokens.json --poll-interval 300 --reload-interval 30
       Restart=on-failure
       RestartSec=10s

       NoNewPrivileges=yes
       ProtectSystem=strict
       ProtectHome=yes
       PrivateTmp=yes
       PrivateDevices=yes
       ProtectKernelTunables=yes
       ProtectKernelModules=yes
       ProtectControlGroups=yes
       RestrictNamespaces=yes
       RestrictSUIDSGID=yes
       LockPersonality=yes
       MemoryDenyWriteExecute=yes
       RestrictRealtime=yes
       SystemCallArchitectures=native
       CapabilityBoundingSet=
       AmbientCapabilities=
       ReadOnlyPaths=/opt/claude-usage-exporter
       ReadWritePaths=/var/lib/claude-usage-exporter
       IPAddressAllow=100.101.0.0/16
       IPAddressDeny=any

       [Install]
       WantedBy=multi-user.target
       ```

    Notes:
    - `User=nobody` on Debian/Ubuntu = uid 65534.
    - `IPAddressAllow=100.101.0.0/16` + `IPAddressDeny=any` is kernel-level defense beyond bind address.
    - `CapabilityBoundingSet=` (empty RHS) drops ALL capabilities — exporter is pure Python HTTP.
    - `--reload-interval 30` drives mtime polling added in Task 2.
  </action>
  <verify>
    <automated>grep -q 'User=nobody' servers/mcow/systemd/claude-usage-exporter.service &amp;&amp; grep -q -- '--bind-address 100.101.0.9' servers/mcow/systemd/claude-usage-exporter.service &amp;&amp; grep -q 'IPAddressAllow=100.101.0.0/16' servers/mcow/systemd/claude-usage-exporter.service &amp;&amp; grep -q 'bind_address: 100.101.0.9' ansible/group_vars/all.yml</automated>
  </verify>
  <acceptance_criteria>
    - grep `User=nobody` in servers/mcow/systemd/claude-usage-exporter.service returns 1 line
    - grep `Group=nogroup` in the same file returns 1 line
    - grep `--bind-address 100.101.0.9` in the same file returns 1 line
    - grep `--port 9101` in the same file returns 1 line
    - grep `--reload-interval 30` in the same file returns 1 line
    - grep `CapabilityBoundingSet=$` in the same file returns 1 line
    - grep `IPAddressAllow=100.101.0.0/16` in the same file returns 1 line
    - grep `IPAddressDeny=any` in the same file returns 1 line
    - grep `ProtectSystem=strict` in the same file returns 1 line
    - grep `bind_address: 100.101.0.9` in ansible/group_vars/all.yml returns 1 line
    - grep `0.0.0.0` in servers/mcow/systemd/claude-usage-exporter.service returns 0 lines
    - grep `User=root` in the same file returns 0 lines
  </acceptance_criteria>
  <done>Systemd unit hardened, bound to Tailnet IP, running as nobody; group_vars carry the new values.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add mtime-poll registry reload + CLI flags to exporter.py</name>
  <files>servers/mcow/claude-usage-exporter/exporter.py, servers/mcow/claude-usage-exporter/test_exporter.py, servers/mcow/claude-usage-exporter/README.md</files>
  <read_first>
    - servers/mcow/claude-usage-exporter/exporter.py (current poll loop + token loading; identify hardcoded bind addr / token list pattern)
    - .planning/phases/13-claude-tokens-page/13-CONTEXT.md §D-13-07 (mtime-poll 30s reload, no Ansible redeploy)
    - .planning/MILESTONE-CLOSE-v2.0.md (v2.0 exporter history)
  </read_first>
  <behavior>
    - Test 1: `_reload_registry_if_changed` returns False when file mtime unchanged
    - Test 2: Returns True and updates state when mtime advances
    - Test 3: Filters out `enabled: false` and `deleted_at != null` entries from state['tokens']
    - Test 4: Returns False and keeps last-known state when file missing (FileNotFoundError)
    - Test 5: Logger output never contains 'sk-ant-oat01-' substring even when registry has a test token value
  </behavior>
  <action>
    1. Add `argparse` CLI flags at program entry of `exporter.py`. REPLACE any hardcoded bind/port/registry paths with parsed args:
       ```python
       import argparse
       parser = argparse.ArgumentParser()
       parser.add_argument('--bind-address', default='127.0.0.1')
       parser.add_argument('--port', type=int, default=9101)
       parser.add_argument('--registry', required=True)
       parser.add_argument('--poll-interval', type=int, default=300)
       parser.add_argument('--reload-interval', type=int, default=30)
       args = parser.parse_args()
       ```
       Wire `args.bind_address` + `args.port` into whichever HTTP server the file uses (`start_http_server(args.port, addr=args.bind_address)` for prometheus_client).

    2. Add `_reload_registry_if_changed(path: str, state: dict) -> bool`:
       ```python
       def _reload_registry_if_changed(path, state):
           try:
               mtime = os.stat(path).st_mtime
           except FileNotFoundError:
               if state.get('tokens') is None:
                   logger.warning('registry file missing at %s; no tokens to poll', path)
               else:
                   logger.warning('registry file missing at %s; keeping last-known tokens', path)
               return False
           if state.get('mtime') == mtime:
               return False
           with open(path) as f:
               data = json.load(f)
           tokens = [t for t in data.get('tokens', [])
                     if t.get('enabled') and not t.get('deleted_at')]
           state['tokens'] = tokens
           state['mtime'] = mtime
           logger.info('registry reloaded: %d enabled tokens', len(tokens))
           return True
       ```
       Logger calls MUST use only label/count/path — never the `value` field.

    3. Rewrite the main loop to interleave reload-check and poll:
       ```python
       state = {'tokens': None, 'mtime': None}
       _reload_registry_if_changed(args.registry, state)
       last_poll = 0
       last_reload = time.time()
       while True:
           now = time.time()
           if now - last_reload >= args.reload_interval:
               _reload_registry_if_changed(args.registry, state)
               last_reload = now
           if now - last_poll >= args.poll_interval:
               poll_all_tokens(state.get('tokens') or [])
               last_poll = now
           time.sleep(min(args.reload_interval, args.poll_interval) / 2)
       ```

    4. In `poll_all_tokens` (or its equivalent), after each full poll cycle, call `.remove(labels)` on gauges whose labels no longer appear in `state['tokens']` to prevent stale Prometheus series. Track label-sets across cycles via a module-level set.

    5. In ALL error handlers, ensure the token value is never in the log format string. Add a module constant and assertion helper:
       ```python
       _TOKEN_PREFIX = 'sk-ant-oat01-'
       def _redact(s: str) -> str:
           return _TOKEN_PREFIX + '[REDACTED]' if s and s.startswith(_TOKEN_PREFIX) else s
       ```
       Replace any `str(exception)` or `repr(token)` patterns with `_redact(...)` when the string could contain the token.

    6. Create `servers/mcow/claude-usage-exporter/test_exporter.py` (pytest):
       ```python
       import json, os, time, logging
       from pathlib import Path
       import pytest
       from exporter import _reload_registry_if_changed

       def _write(path, data):
           path.write_text(json.dumps(data))

       def test_reload_noop_on_unchanged_mtime(tmp_path):
           p = tmp_path / 'reg.json'
           _write(p, {'tokens': [{'id': 'a', 'label': 'a', 'value': 'sk-ant-oat01-x',
                                   'tier': 'pro', 'owner_host': 'h', 'enabled': True,
                                   'added_at': '2026-04-17T00:00:00Z'}]})
           state = {}
           assert _reload_registry_if_changed(str(p), state) is True
           assert _reload_registry_if_changed(str(p), state) is False

       def test_reload_loads_when_file_changes(tmp_path):
           p = tmp_path / 'reg.json'
           _write(p, {'tokens': []})
           state = {}
           _reload_registry_if_changed(str(p), state)
           time.sleep(0.01)
           _write(p, {'tokens': [{'id': 'b', 'label': 'b', 'value': 'sk-ant-oat01-y',
                                   'tier': 'pro', 'owner_host': 'h', 'enabled': True,
                                   'added_at': '2026-04-17T00:00:00Z'}]})
           os.utime(p, (time.time()+1, time.time()+1))
           assert _reload_registry_if_changed(str(p), state) is True
           assert len(state['tokens']) == 1

       def test_reload_filters_disabled_and_soft_deleted(tmp_path):
           p = tmp_path / 'reg.json'
           _write(p, {'tokens': [
               {'id':'1','label':'a','value':'sk-ant-oat01-x','tier':'pro','owner_host':'h','enabled':True,'added_at':'2026-04-17T00:00:00Z'},
               {'id':'2','label':'b','value':'sk-ant-oat01-y','tier':'pro','owner_host':'h','enabled':False,'added_at':'2026-04-17T00:00:00Z'},
               {'id':'3','label':'c','value':'sk-ant-oat01-z','tier':'pro','owner_host':'h','enabled':True,'added_at':'2026-04-17T00:00:00Z','deleted_at':'2026-04-17T01:00:00Z'},
           ]})
           state = {}
           _reload_registry_if_changed(str(p), state)
           assert {t['label'] for t in state['tokens']} == {'a'}

       def test_reload_missing_file_keeps_last_known(tmp_path):
           state = {'tokens': [{'label': 'prev'}], 'mtime': 1.0}
           result = _reload_registry_if_changed(str(tmp_path / 'nope.json'), state)
           assert result is False
           assert state['tokens'] == [{'label': 'prev'}]

       def test_logger_never_leaks_token_value(tmp_path, caplog):
           p = tmp_path / 'reg.json'
           _write(p, {'tokens': [{'id':'1','label':'l','value':'sk-ant-oat01-SECRETVALUE',
                                   'tier':'pro','owner_host':'h','enabled':True,
                                   'added_at':'2026-04-17T00:00:00Z'}]})
           with caplog.at_level(logging.DEBUG):
               _reload_registry_if_changed(str(p), {})
           joined = '\n'.join(rec.getMessage() for rec in caplog.records)
           assert 'SECRETVALUE' not in joined
           assert 'sk-ant-oat01-' not in joined
       ```

    7. Update `servers/mcow/claude-usage-exporter/README.md`: add a `## Runtime reload` section explaining:
       - Exporter polls registry file mtime every 30s (--reload-interval)
       - Admin-app SOPS writes → Ansible trigger decrypts → exporter reloads within 30-60s
       - Restart is NOT needed for registry changes. Restart IS needed for code/systemd changes.
  </action>
  <verify>
    <automated>cd servers/mcow/claude-usage-exporter &amp;&amp; python3 -m pytest test_exporter.py -x -v</automated>
  </verify>
  <acceptance_criteria>
    - grep `argparse` in servers/mcow/claude-usage-exporter/exporter.py returns at least 1 line
    - grep `_reload_registry_if_changed` in exporter.py returns at least 2 lines
    - grep `st_mtime` in exporter.py returns at least 1 line
    - grep `--reload-interval` in exporter.py returns at least 1 line
    - grep `--bind-address` in exporter.py returns at least 1 line
    - `python3 -m pytest servers/mcow/claude-usage-exporter/test_exporter.py -x` exits 0
    - Output shows 5 passed
    - grep `## Runtime reload` in servers/mcow/claude-usage-exporter/README.md returns 1 line
    - grep -rE 'logger\.(info|warning|error|debug).*token\.value' servers/mcow/claude-usage-exporter/exporter.py returns 0 lines
  </acceptance_criteria>
  <done>Exporter accepts CLI flags, polls mtime every 30s, reloads enabled tokens only, all 5 unit tests pass.</done>
</task>

<task type="auto">
  <name>Task 3: Idempotent Ansible playbook for deploy + SOPS decrypt</name>
  <files>ansible/playbooks/deploy-claude-usage-exporter.yml</files>
  <read_first>
    - ansible/playbooks/deploy-claude-usage-exporter.yml (current structure)
    - ansible/playbooks/deploy-homelab-admin.yml (Phase 12 SOPS decrypt + no_log pattern)
    - .planning/phases/12-infra-foundation/12-CONTEXT.md (decrypt→render→drop_facts pattern)
    - servers/mcow/systemd/claude-usage-exporter.service (target unit file from Task 1)
    - ansible/group_vars/all.yml (claude_usage_exporter.* variables from Task 1)
  </read_first>
  <action>
    Rewrite `ansible/playbooks/deploy-claude-usage-exporter.yml` to this exact content (adjust `playbook_dir` paths only if inventory layout differs):

    ```yaml
    ---
    - name: Deploy claude-usage-exporter to mcow
      hosts: mcow
      become: true
      vars:
        exporter_src: "{{ playbook_dir }}/../../servers/mcow/claude-usage-exporter"
        unit_src: "{{ playbook_dir }}/../../servers/mcow/systemd/claude-usage-exporter.service"
        sops_file: "{{ playbook_dir }}/../../secrets/claude-tokens.sops.yaml"
      tasks:
        - name: Ensure state dir exists (owned by nobody)
          ansible.builtin.file:
            path: "{{ claude_usage_exporter.state_dir }}"
            state: directory
            owner: nobody
            group: nogroup
            mode: "0750"

        - name: Ensure install dir exists (root-owned, read-only to nobody)
          ansible.builtin.file:
            path: "{{ claude_usage_exporter.install_dir }}"
            state: directory
            owner: root
            group: root
            mode: "0755"

        - name: Rsync exporter source to mcow
          ansible.posix.synchronize:
            src: "{{ exporter_src }}/"
            dest: "{{ claude_usage_exporter.install_dir }}/"
            delete: true
            rsync_opts:
              - "--exclude=__pycache__"
              - "--exclude=*.pyc"
              - "--exclude=test_exporter.py"
          notify: restart claude-usage-exporter

        - name: Install systemd unit file
          ansible.builtin.copy:
            src: "{{ unit_src }}"
            dest: /etc/systemd/system/claude-usage-exporter.service
            owner: root
            group: root
            mode: "0644"
          notify:
            - reload systemd
            - restart claude-usage-exporter

        - name: Decrypt claude-tokens registry on controller
          delegate_to: localhost
          become: false
          ansible.builtin.command: sops -d --output-type json {{ sops_file }}
          register: decrypted_registry
          changed_when: false
          no_log: true

        - name: Render decrypted registry on mcow (nobody-readable, 0440)
          ansible.builtin.copy:
            content: "{{ decrypted_registry.stdout }}"
            dest: "{{ claude_usage_exporter.read_path }}"
            owner: nobody
            group: nogroup
            mode: "0440"
          no_log: true
          # mtime advance → exporter reloads within reload_interval seconds

        - name: Drop decrypted fact from memory
          ansible.builtin.set_fact:
            decrypted_registry: !!null
          no_log: true

        - name: Ensure service enabled and running
          ansible.builtin.systemd:
            name: claude-usage-exporter
            enabled: true
            state: started
            daemon_reload: true

      handlers:
        - name: reload systemd
          ansible.builtin.systemd:
            daemon_reload: true

        - name: restart claude-usage-exporter
          ansible.builtin.systemd:
            name: claude-usage-exporter
            state: restarted
    ```

    Idempotency notes:
    - `synchronize` with `delete: true` is idempotent (no-op when src==dest).
    - `copy` for the registry file uses content hash — no change when content stable.
    - `systemd` tasks are idempotent.
    - Decrypt task carries `changed_when: false` — the "changed" signal comes from the downstream copy task's content hash comparison.
    - Do NOT use `blockinfile`. The unit file is a full replace via `copy`.
  </action>
  <verify>
    <automated>ansible-playbook --syntax-check ansible/playbooks/deploy-claude-usage-exporter.yml &amp;&amp; grep -q 'no_log: true' ansible/playbooks/deploy-claude-usage-exporter.yml &amp;&amp; grep -q 'delegate_to: localhost' ansible/playbooks/deploy-claude-usage-exporter.yml &amp;&amp; grep -q 'state_dir' ansible/playbooks/deploy-claude-usage-exporter.yml</automated>
  </verify>
  <acceptance_criteria>
    - `ansible-playbook --syntax-check ansible/playbooks/deploy-claude-usage-exporter.yml` exits 0
    - grep `no_log: true` in playbook returns at least 2 lines (decrypt + render + drop_fact)
    - grep `delegate_to: localhost` in playbook returns 1 line (the decrypt step)
    - grep `ansible.posix.synchronize` in playbook returns 1 line
    - grep `claude_usage_exporter.state_dir` in playbook returns 1 line
    - grep `claude_usage_exporter.install_dir` in playbook returns 1 line
    - grep `claude_usage_exporter.read_path` in playbook returns 1 line
    - grep `blockinfile` in playbook returns 0 lines
    - grep `changed_when: false` in playbook returns 1 line (decrypt step)
  </acceptance_criteria>
  <done>Playbook passes syntax check, uses no_log on all secret-carrying tasks, follows Phase 12 decrypt→render→drop pattern.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Deploy + verify SEC-03 success criteria from SC #5</name>
  <what-built>Hardened exporter deployed on mcow: Tailnet-only bind at 100.101.0.9:9101, running as uid 65534, hot-reloads registry on mtime change.</what-built>
  <how-to-verify>
    From operator machine:
    1. Run `ansible-playbook -i ansible/inventory.ini ansible/playbooks/deploy-claude-usage-exporter.yml` — first run should converge.
    2. Re-run the same command immediately — expected: all tasks report `ok`, zero `changed`. If anything is `changed` on the second run, that's a non-idempotency bug — fix before approving.
    3. SSH to mcow: `ssh root@mcow 'systemctl status claude-usage-exporter'` — confirm `active (running)` and `Main PID` line.
    4. SSH to mcow: `ssh root@mcow 'ps -o uid,user,args -p $(systemctl show -p MainPID --value claude-usage-exporter)'` — expected uid = `65534`, user = `nobody`.
    5. Tailnet probe (from docker-tower, which is on Tailnet): `ssh root@docker-tower 'curl -sS --max-time 5 http://100.101.0.9:9101/metrics | head -20'` — expected: Prometheus exposition format (`# HELP`, `# TYPE`, metric lines). Must contain `claude_usage_` prefix somewhere.
    6. External probe (from a non-Tailnet host — e.g. operator laptop with Tailscale temporarily disabled, or any public-internet host): `curl -sS --max-time 5 http://100.101.0.9:9101/metrics` — expected: connection refused / timeout / no route. MUST NOT return metrics.
    7. Registry mtime reload smoke test: `ssh root@mcow 'touch /var/lib/claude-usage-exporter/claude-tokens.json && sleep 35 && journalctl -u claude-usage-exporter --since="1 minute ago" | grep "registry reloaded"'` — expected: at least one `registry reloaded` log line after the touch.
    8. Confirm no token values leaked to journal: `ssh root@mcow 'journalctl -u claude-usage-exporter --since="1 hour ago" | grep -c "sk-ant-oat01-"'` — expected: `0`.

    Paste the outputs of steps 2-8 into the checkpoint resume message.
  </how-to-verify>
  <resume-signal>Type "approved" with pasted outputs, or describe the failure (e.g. "step 4 returned uid 0 — still running as root").</resume-signal>
  <acceptance_criteria>
    - Step 2: Second playbook run shows `changed=0` in the recap
    - Step 4: ps output shows uid `65534` and user `nobody`
    - Step 5: Tailnet curl returns HTTP 200 with `# HELP` lines in body
    - Step 6: External curl fails (connection refused, timeout, or no route)
    - Step 7: journalctl shows at least one `registry reloaded:` log entry after the `touch`
    - Step 8: journalctl grep for `sk-ant-oat01-` returns `0`
  </acceptance_criteria>
  <done>SC #5 from ROADMAP proven operationally: Tailnet bind works, external fails, uid 65534, reload works, no token leakage.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| public internet → mcow:9101 | Must be closed — exporter exposes per-token metrics |
| Tailnet → mcow:9101 | Open — docker-tower Prometheus scrapes here |
| exporter process → token values | Plaintext values must not leak to journald/stderr/scrape output |
| root → exporter process | Exporter runs as nobody; root compromise bypasses but that's out of scope |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-13-02-01 | Information Disclosure | 0.0.0.0 bind exposes metrics publicly | mitigate | Task 1 rebinds to 100.101.0.9; Task 4 step 6 proves external fails |
| T-13-02-02 | Information Disclosure | Metric labels contain token values | accept | Metric schema uses `label` (human tag) not `value`; verified in Phase 06 operational summary; Task 2 test 5 asserts no leak to logs |
| T-13-02-03 | Elevation of Privilege | Exporter running as root (pre-SEC-03) | mitigate | Task 1 sets User=nobody; CapabilityBoundingSet=; NoNewPrivileges=yes; Task 4 step 4 proves uid 65534 |
| T-13-02-04 | Denial of Service | Malformed registry JSON crashes exporter | mitigate | Task 2 `_reload_registry_if_changed` catches FileNotFoundError; Python json.load raises on parse — exporter restarts via systemd `Restart=on-failure` with 10s backoff |
| T-13-02-05 | Tampering | Registry file writable by non-root | mitigate | Task 3 renders with mode 0440 owner nobody group nogroup; install_dir 0755 root:root; only Ansible (running as root via become) writes the read path |
| T-13-02-06 | Information Disclosure | Plaintext registry on disk readable by other local users | mitigate | Mode 0440 and directory 0750 on state_dir restrict to nobody; mcow is single-tenant KVM; no other local users |
| T-13-02-07 | Spoofing | Another process binds 9101 first | accept | systemd socket ownership + Restart=on-failure ensures only our unit listens; Tailnet IP binding rejects non-mcow addresses |
| T-13-02-08 | Denial of Service | Exporter memory leak under many tokens | accept | Current plan caps at 2-5 tokens per ROADMAP Phase 11 scope; future scale is out of phase |

All threats have a disposition. No high-severity unmitigated.
</threat_model>

<verification>
- `ansible-playbook --syntax-check ansible/playbooks/deploy-claude-usage-exporter.yml` exits 0
- `python3 -m pytest servers/mcow/claude-usage-exporter/test_exporter.py -x` exits 0 (5 passed)
- Task 4 all 8 steps pass
- ROADMAP SC #5 proven: external curl fails, Tailnet curl succeeds, uid 65534
</verification>

<success_criteria>
SEC-03 tech-debt paid. Exporter is Tailnet-only, privilege-dropped, and capable of hot-reloading the registry on mtime change — this is the operational prerequisite for Plan 13-03's SOPS write path and Plan 13-04/05's UI mutations.
</success_criteria>

<output>
After completion, create `.planning/phases/13-claude-tokens-page/13-02-SUMMARY.md` noting: journalctl `registry reloaded` example, systemctl show output for User/uid, external-probe outcome, any pivot from plan spec.
</output>
