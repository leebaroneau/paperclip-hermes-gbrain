# Volumes (data inventory)

One row per named volume / bind mount. This is the single most dangerous thing to get wrong on
Coolify — a reshaped `volumes:` block has wiped prod data before. Keep this current.

This repo ships ONE named volume, shared by both services. Per-brand deployments mount the same
shape; the data inside is brand-specific and lives only on each brand's droplet (never in this repo).

| Volume / container path | Service | What it persists | Backup command | Restore command |
| --- | --- | --- | --- | --- |
| `paperclip-data` → `/data` | paperclip + hermes (shared) | Paperclip DB (embedded postgres) + Hermes profiles/state, `agent-stack/` (org-chart, profile-sync), OAuth tokens under `hermes/.config`, `repos/` worktrees | `paperclipai db:backup --dir <dir>` for the DB; `tar czf hermes-profiles.tar.gz -C /data hermes/profiles ...` for Hermes state — both wired into `paperclip/pre-deploy-backup.sh` (see `pre-deploy-backup.md`), which snapshots to the per-brand state repo's `agent-state` branch before every deploy | DB: `gunzip -c paperclip-*.sql.gz \| paperclipai db:restore`; Hermes state: `tar xzf hermes-profiles.tar.gz -C /data`. Pull the snapshot from the brand state repo's `agent-state` branch |

Rule: before ANY change to the `volumes:` block in `compose.yaml`, back up every row above
and store the archive OUTSIDE the volume. Confirm the restore command actually works.
