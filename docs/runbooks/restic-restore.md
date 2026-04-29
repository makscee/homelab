# Restic restore runbook (mcow ← nether)

Recover `/var/lib/docker/volumes/void-*` from the off-host restic repo on `nether` (`/var/backups/restic/mcow`). Tested 2026-04-28 with `void-canary`.

## Drill bug postmortem (2026-04-28)

The first restore drill caught a critical bug: the Ansible playbook used `vars_files: ../../secrets/mcow.sops.yaml` without invoking SOPS decryption. Without the `community.sops` collection installed, Ansible treated the file as plain YAML and loaded `restic_password` as the literal envelope string `ENC[AES256_GCM,...]`. The repo on nether was initialized with that envelope as the password. The SOPS plaintext (the value an operator would obtain via `sops -d` during disaster recovery) did NOT unlock the repo.

**Detection:** running `restic snapshots` from a different host using the SOPS plaintext returned `Fatal: wrong password or no key found`.

**Fix applied:**
1. Added `community.sops` to `ansible/requirements.yml`.
2. Replaced `vars_files:` with `community.sops.load_vars` in Play B of `restic-mcow.yml`.
3. Added the SOPS plaintext as a new key on the repo via `restic key add` (using the envelope-string for auth).
4. Re-ran playbook — `/etc/restic/env` now contains the SOPS plaintext.
5. Verified nightly backup still works against the new plaintext key.
6. Removed the obsolete envelope-string key with `restic key remove`.
7. Verified drill from laptop using SOPS plaintext now restores cleanly.

**Prevention:**
- Any change to `secrets/*.sops.yaml` consumed by Ansible MUST go through `community.sops.load_vars` or `lookup('community.sops.sops', ...)`. Plain `vars_files:` silently treats the envelope as a literal string.
- Future password rotations MUST be drill-tested from a different host before declaring the rotation done.

## Prerequisites

- An age key file containing the recipient that encrypts `secrets/mcow.sops.yaml` (default path: `~/.config/sops/age/keys.txt`; export `SOPS_AGE_KEY_FILE` if elsewhere).
- `restic` installed on the recovery host.
- SSH access to `nether` either as `root@nether` (full sudo on the box) OR via the dedicated restic ed25519 key (sftp-only, restricted on nether's authorized_keys).
- The hub repo checked out so `secrets/mcow.sops.yaml` is reachable.

## Step 1 — Materialize the SOPS plaintext

```bash
cd /Users/admin/hub/workspace/homelab            # or wherever the hub clone lives

sops --extract '["restic_password"]'        --decrypt secrets/mcow.sops.yaml > /tmp/sops_pw
sops --extract '["restic_ssh_private_key"]' --decrypt secrets/mcow.sops.yaml > /tmp/sops_key
chmod 600 /tmp/sops_pw /tmp/sops_key
```

`/tmp/sops_pw` should be ~44 bytes (base64-32). `/tmp/sops_key` is the ed25519 private key.

## Step 2 — List snapshots

```bash
RESTIC_REPOSITORY="sftp:root@nether:/var/backups/restic/mcow" \
RESTIC_PASSWORD_FILE=/tmp/sops_pw \
  restic -o sftp.args="-i /tmp/sops_key -o IdentitiesOnly=yes" \
  snapshots
```

Confirm the host (`mcow`) and the path (`/var/lib/docker/volumes/void-*`) match what you're restoring. Pick a snapshot ID or use `latest`.

## Step 3 — Restore one volume

```bash
mkdir -p /tmp/restore

RESTIC_REPOSITORY="sftp:root@nether:/var/backups/restic/mcow" \
RESTIC_PASSWORD_FILE=/tmp/sops_pw \
  restic -o sftp.args="-i /tmp/sops_key -o IdentitiesOnly=yes" \
  restore latest --target /tmp/restore --include /var/lib/docker/volumes/<volume>
```

Restored data appears at `/tmp/restore/var/lib/docker/volumes/<volume>/_data/...`.

## Step 4 — Reinstate on mcow

For a single volume, push restored data back to mcow and let docker pick it up:

```bash
ssh root@mcow 'docker stop $(docker ps -q --filter name=void-)'
rsync -aH /tmp/restore/var/lib/docker/volumes/<volume>/_data/ \
  root@mcow:/var/lib/docker/volumes/<volume>/_data/
ssh root@mcow 'docker start $(docker ps -aq --filter name=void-)'
```

For full host loss, restore *all* paths under `/var/lib/docker/volumes/void-*` then rerun the homelab playbook to reprovision `/etc/restic/env`, the systemd timer, and the canary.

## Step 5 — Verify with the canary

```bash
diff -u \
  <(ssh root@mcow 'cat /var/lib/docker/volumes/void-canary/_data/canary.txt') \
  /tmp/restore/var/lib/docker/volumes/void-canary/_data/canary.txt
echo "CANARY MATCH"
```

## Step 6 — Cleanup

```bash
rm -f /tmp/sops_pw /tmp/sops_key
rm -rf /tmp/restore
```

## Repo key management

The repo currently has ONE key: the SOPS plaintext (matches `restic_password` in `secrets/mcow.sops.yaml`).

**Adding a new key (e.g. break-glass paper key):**

```bash
ssh root@mcow '
  set -a; . /etc/restic/env; set +a
  restic key add
'
```

It will prompt for the new password.

**Listing / removing keys:**

```bash
ssh root@mcow '
  set -a; . /etc/restic/env; set +a
  restic key list
  restic key remove <ID>
'
```

NEVER remove a key without first confirming the surviving key works from a different host.

## Password rotation

Rotation procedure (zero-downtime, no repo loss):

1. Generate new password and update `secrets/mcow.sops.yaml` via `sops`.
2. SSH to mcow with the *current* password file in `/etc/restic/env`. Add new key:
   ```
   echo -n "<NEW_PASSWORD>" > /tmp/new_pw && chmod 600 /tmp/new_pw
   set -a; . /etc/restic/env; set +a
   restic key add --new-password-file /tmp/new_pw
   ```
3. Run `ansible-playbook ansible/playbooks/restic-mcow.yml` from the hub clone — `/etc/restic/env` will now hold the new password.
4. Verify nightly: `systemctl start restic-daily.service` then `systemctl show restic-daily.service --property=Result`.
5. **Drill from a different host** using the new password (Steps 1-3 above). MUST pass before continuing.
6. Remove the old key: `ssh root@mcow 'set -a; . /etc/restic/env; set +a; restic key remove <OLD_ID>'`.
7. `restic key list` — confirm only the new key remains.
8. `rm -f /tmp/new_pw`.
