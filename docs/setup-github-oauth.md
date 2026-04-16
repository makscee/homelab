# GitHub OAuth App — One-Time Setup for homelab-admin

**Who runs this:** Operator (manual — Claude Code cannot create a GitHub OAuth app)
**When:** Once, before the first `ansible-playbook deploy-homelab-admin.yml` run
**Why it's manual:** GitHub OAuth app creation is human-only (no CLI/API for creation — only for management post-creation)

## Prerequisites

- You are logged in as `makscee` on github.com
- DNS record `homelab.makscee.ru → 100.101.0.9` exists (it does, per servers/nether/README.md lineage)
- SOPS + age are installed on your laptop (check `sops --version` and `age --version`)

## Step 1: Create the OAuth App

1. Open https://github.com/settings/developers in browser (as `makscee`)
2. Click **New OAuth App**
3. Fill in exactly:
   - **Application name:** `Homelab Admin (makscee)`
   - **Homepage URL:** `https://homelab.makscee.ru`
   - **Application description:** `Internal homelab operator dashboard`
   - **Authorization callback URL:** `https://homelab.makscee.ru/api/auth/callback/github`
   - **Enable Device Flow:** OFF (leave unchecked)
4. Click **Register application**
5. On the resulting page, you will see the **Client ID** (public, safe to note).
6. Click **Generate a new client secret** — copy the generated secret immediately (GitHub shows it ONCE). Never paste this into chat, the repo, or anywhere outside `secrets/mcow.sops.yaml`.

## Step 2: Generate an AUTH_SECRET

Auth.js v5 needs a 32+ byte secret for JWT signing:

```bash
openssl rand -base64 32
```

Copy the output.

## Step 3: Put the four values into SOPS

Open `secrets/mcow.sops.yaml` for editing:

```bash
cd /path/to/homelab
sops secrets/mcow.sops.yaml
```

Add (or update — Plan 12-08 authors the schema) under a top-level `homelab_admin:` key:

```yaml
homelab_admin:
  github_oauth_client_id: "<paste Client ID from Step 1>"
  github_oauth_client_secret: "<paste Client Secret from Step 1 — shown once>"
  auth_secret: "<paste openssl output from Step 2>"
  allowed_github_logins: "makscee"   # comma-separated; add more logins later by editing here + redeploying
```

Save. SOPS re-encrypts on save with the age key in `.sops.yaml`.

## Step 4: Verify

```bash
sops -d secrets/mcow.sops.yaml | grep -A1 homelab_admin:
```

You should see the four keys decrypt correctly. Do NOT commit the plaintext output.

## Step 5: Commit the encrypted file

```bash
git add secrets/mcow.sops.yaml
git commit -m "feat(secrets): add homelab_admin OAuth + AUTH_SECRET to mcow.sops.yaml"
```

## Local Dev (optional)

If you want to run `bun run dev` locally before deploy, you can either:

- **Option A:** Add `http://localhost:3847/api/auth/callback/github` as an ADDITIONAL callback URL on the SAME OAuth app (GitHub supports multiple callback URLs via comma-separated list since 2022). Both prod and dev then share the same Client ID.
- **Option B:** Create a SECOND GitHub OAuth app named `Homelab Admin (dev)` with callback `http://localhost:3847/api/auth/callback/github` and put its Client ID/Secret in `apps/admin/.env.local` (gitignored).

## Rotating the OAuth Client Secret

1. GitHub settings page → **Generate a new client secret**
2. `sops secrets/mcow.sops.yaml` → update `homelab_admin.github_oauth_client_secret`
3. Commit + run `ansible-playbook deploy-homelab-admin.yml` — Plan 09's deploy rewrites `/etc/homelab-admin/env` and restarts the systemd unit
4. Delete the old secret from GitHub settings

## Rotating AUTH_SECRET (session invalidation)

Changing `homelab_admin.auth_secret` and redeploying invalidates ALL active JWT sessions. Operator re-signs in. This is the documented session-revocation path for Phase 12 per D-12-08.
