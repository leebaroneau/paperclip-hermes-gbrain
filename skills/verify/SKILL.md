---
name: verify
description: Validate the change against the deployed Coolify environment (preview URL or staging) before merge.
---

# Verify

Use after CI is green and before merging.

## Steps


1. Open the Coolify preview deploy URL from the PR comments. If not yet ready, wait — every push triggers a fresh build.
2. Walk through the acceptance criteria from the active plan against the preview URL.
3. Tail logs: `coolify app logs --uuid <preview-uuid>` (or via the Coolify UI).
4. If the preview includes a database, verify migrations applied cleanly.

5. Hit the service's `/healthz` (or documented health endpoint) — expect `200`.
6. Capture proof of verification (URL or log excerpt) and paste into the PR before merging.

## When to escalate

- Healthcheck fails → do NOT merge. File a `type:bug` issue against this service.
- New error in logs at startup → do NOT merge. Investigate via `./scripts/doctor` and the active plan.
