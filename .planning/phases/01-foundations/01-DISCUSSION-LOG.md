# Phase 1: Foundations - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 01-foundations
**Areas discussed:** Repo structure, SOPS + age setup, Inventory doc format, Dependency & topology format

---

## Repo Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Per-server (keep) | Keep servers/{hostname}/ as primary layout | |
| Hybrid (server + shared) | servers/ per-host + shared/ for cross-cutting + docs/ for documentation | ✓ |
| Per-service | Group by service instead of server | |

**User's choice:** Hybrid (server + shared)
**Notes:** User preferred separation of concerns with a shared/ directory for cross-cutting items.

### Docs location

| Option | Description | Selected |
|--------|-------------|----------|
| docs/ at root | Dedicated docs/ directory for cross-server documentation | ✓ |
| In servers/ README | Top-level README.md in servers/ | |
| In CLAUDE.md | Put everything in CLAUDE.md | |

**User's choice:** docs/ at root

### Consolidation

| Option | Description | Selected |
|--------|-------------|----------|
| Merge into servers/ | Move root docker-tower/ into servers/docker-tower/ | ✓ |
| Keep both | Root for active configs, servers/ for documentation | |
| You decide | Claude picks | |

**User's choice:** Merge into servers/

---

## SOPS + Age Setup

### Config location

| Option | Description | Selected |
|--------|-------------|----------|
| Hub repo root | .sops.yaml in parent hub/ workspace root | ✓ |
| Homelab repo root | Self-contained .sops.yaml in homelab/ | |
| Both (hub + local override) | Hub master + homelab override | |

**User's choice:** Hub repo root

### Secret references

| Option | Description | Selected |
|--------|-------------|----------|
| Encrypted value files | secrets/ dir with SOPS-encrypted YAML files | ✓ |
| Inline encrypted values | Encrypt values inside compose files | |
| Env file pattern | .env files encrypted with SOPS | |

**User's choice:** Encrypted value files

### Age key storage

| Option | Description | Selected |
|--------|-------------|----------|
| Operator machine only | Key on cc-vk and local machine, never committed | ✓ |
| SSH key derivation | Derive age identity from SSH keys | |
| You decide | Claude picks simplest approach | |

**User's choice:** Operator machine only

---

## Inventory Doc Format

### Format

| Option | Description | Selected |
|--------|-------------|----------|
| Markdown | inventory.md per server, human and AI readable | ✓ |
| YAML | inventory.yaml, machine-parseable | |
| Both (YAML + rendered) | YAML source, auto-generate markdown | |

**User's choice:** Markdown

### Fields (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Hosted services list | All services with ports and descriptions | ✓ |
| Storage layout | Disk partitions, mount points, data paths | ✓ |
| Access info | SSH user, connection method, special notes | ✓ |
| You decide | Claude includes what makes sense per server | ✓ |

**User's choice:** All options selected — include services, storage, access info, plus Claude's discretion for additional fields

---

## Dependency & Topology Format

### Dependency map

| Option | Description | Selected |
|--------|-------------|----------|
| Mermaid in Markdown | Mermaid flowchart in dependency-map.md | ✓ |
| Plain Markdown tables | Table listing services and dependencies | |
| YAML + generated diagram | YAML source, generate Mermaid/SVG | |

**User's choice:** Mermaid in Markdown

### Network topology

| Option | Description | Selected |
|--------|-------------|----------|
| Mermaid in Markdown | Mermaid diagram in network-topology.md | ✓ |
| ASCII diagram | Hand-drawn ASCII art | |
| You decide | Claude picks best format per section | |

**User's choice:** Mermaid in Markdown

---

## Claude's Discretion

- Additional inventory fields beyond required set
- Mermaid diagram style choices
- shared/ directory internal structure
- .gitignore additions for secrets patterns

## Deferred Ideas

None — discussion stayed within phase scope.
