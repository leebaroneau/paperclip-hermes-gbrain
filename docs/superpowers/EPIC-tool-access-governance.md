# Epic — Tool Access Governance

**Status:** parked. Plan ready, not in active development.
**Branch:** `epic/tool-access-governance-phase-1`
**Roadmap (Phase 3 UI):** [leebaroneau/template-agent#21](https://github.com/leebaroneau/template-agent/issues/21)
**Active dev (Paperclip PR1-3 testing):** PR #17 on `feat/tool-access-governance-template` (separate scope)

## What this epic delivers

A central, auditable system for declaring which tools each Paperclip agent can use, with per-Hermes-profile enforcement on disk. Tokens are projected by reference (`secret://...`) — never at rest in profile dirs. Editing surface (Paperclip) and enforcement (per-profile config.yaml) are split; `profile-sync.mjs` is the bridge.

Three phases, in order:

1. **Phase 1 — Security plumbing.** `profile-sync` extensions, managed-flag opt-in, atomic YAML writes, three-tier gateway bounce, `secret://` resolver wrapper. No new UI. *Plan in this branch.*
2. **Phase 2 — Conversational governance.** Paperclip MCP governance tools (`paperclip_grant_tool`, `paperclip_apply_preset`, …) so daily use is "@admin grant Marketer GitHub" — no clicking.
3. **Phase 3 — Policy + audit UI.** Matrix tab, Connections tab, Presets editor, Audit log. Built when scale demands (15+ agents, second operator, multi-tenant client security review).

## Documents in this branch

- [Design spec](specs/2026-05-19-tool-access-matrix-design.md) — full architecture, IA, UX for all three phases, projection contract, edge cases
- [Phase 1 implementation plan](plans/2026-05-20-tool-access-governance-phase-1.md) — 9 tasks, TDD-shaped, ready to execute

## Upstream Paperclip PRs this epic depends on

These are upstream changes in `paperclipai/paperclip` that the template-side `profile-sync` integration needs. Phase 1 cannot proceed until at least the first two land.

| PR | Scope | Status |
|---|---|---|
| **Paperclip #6242** | Tool catalog data model + REST API | (set by upstream) |
| **Paperclip #6243** | Governance, approvals, presets, rendered tool-access metadata | (set by upstream) |
| **Paperclip #6244** (planned) | `metadata.toolAccess.managed` flag + MCP governance tools + Connection `inject_as_env` mapping | (planned) |

When picking this work up, first verify:
- All three Paperclip PRs are merged (or at least mergeable + on a stable branch you can pin to)
- `hermes-agent` upstream has `secret://` URI resolution (or the wrapper-script approach from Phase 1 plan Task 6 is acceptable)
- `hermes gateway reload` is available (or fall back to `restart` per Phase 1 plan Task 5)

## When to start this epic

Pick any of:
- A Paperclip company you're running has reached **5+ agents** that need different tool sets
- You want a deployable client template that includes per-profile credential isolation
- You're about to add an OAuth tool (GitHub, Slack, Linear) and don't want a shared credential bag
- Multi-tenant client demands a security review

Until then, leave this branch parked. Rebase onto `main` weekly so it doesn't rot.

## What to do when picking it up

1. Verify upstream Paperclip PR status (see table above)
2. Rebase this branch onto current `main`
3. Read the plan: [`plans/2026-05-20-tool-access-governance-phase-1.md`](plans/2026-05-20-tool-access-governance-phase-1.md)
4. Execute via `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`
5. Each task is one commit; PR opens for review after Phase 1's full task list is green
