---
status: SECURED
threats_total: 8
threats_closed: 8
threats_open: 0
phase: 01-foundations
asvs_level: 1
audited: 2026-04-13
---

# Security Audit — Phase 01: Foundations

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-01-01 | Information Disclosure | mitigate | CLOSED | `.gitignore` lines 22-23: `secrets/*.yaml` and `!secrets/*.sops.yaml` present |
| T-01-02 | Information Disclosure | mitigate | CLOSED | `.gitignore` lines 26-27: `*.age` and `keys.txt` present |
| T-01-03 | Denial of Service | mitigate | CLOSED | `/Users/admin/hub/.sops.yaml` exists with valid age1 recipient; encrypt/decrypt round-trip verified in 01-01-SUMMARY.md |
| T-01-04 | Tampering | accept | CLOSED | See accepted risks log below |
| T-02-01 | Information Disclosure | accept | CLOSED | See accepted risks log below |
| T-02-02 | Information Disclosure | accept | CLOSED | See accepted risks log below |
| T-03-01 | Information Disclosure | accept | CLOSED | See accepted risks log below |
| T-03-02 | Information Disclosure | accept | CLOSED | See accepted risks log below |

## Accepted Risks

| Threat ID | Component | Rationale | Owner |
|-----------|-----------|-----------|-------|
| T-01-04 | .sops.yaml creation_rules tampering | Hub repo is private and version-controlled. Tampering would require write access to the repo. Low risk at homelab scale. | operator |
| T-02-01 | inventory.md files | Files contain internal Tailscale IPs (not internet-routable) and service names only. No credentials present. Repo is private. | operator |
| T-02-02 | SSH query outputs | SSH queries captured only hardware specs and service lists. No secrets extracted. All secret values replaced with REDACTED in source files per 01-02-SUMMARY.md. | operator |
| T-03-01 | network-topology.md | Contains Tailscale IPs (internal-only, not internet-routable) and nether public IP (77.239.110.57, already exposed by design as VPN endpoint). Repo is private. | operator |
| T-03-02 | dependency-map.md | Contains service names and port numbers only. No credentials or sensitive configuration values. Repo is private. | operator |

## Unregistered Threat Flags

None. Both 01-02-SUMMARY.md and 01-03-SUMMARY.md report no threat flags beyond those already registered in the threat model.

## Audit Trail

| Date | Auditor | Phase | Result |
|------|---------|-------|--------|
| 2026-04-13 | gsd-secure-phase (claude-sonnet-4-6) | 01-foundations (plans 01-01, 01-02, 01-03) | SECURED — 8/8 threats closed |
