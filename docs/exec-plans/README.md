# Execution Plans

In-repository plans for in-flight and completed work. The agent loop (`./scripts/ralph`) reads
the first `*.md` in `active/` and drives toward acceptance.

## Layout

- `active/` — plans currently being worked on. One file per plan.
- `completed/` — plans whose acceptance criteria were met. Move files here when done.
- `tech-debt-tracker.md` — accumulated debt with severity and notes.

## Plan format

Every plan file should include:

1. **Goal** — what done looks like in one paragraph.
2. **Acceptance criteria** — bulleted, mechanically checkable. `./scripts/doctor` should be one of them.
3. **Out of scope** — what NOT to do.
4. **Notes / context** — links to docs, prior decisions, related issues.
5. **Progress log** — append-only entries from agent iterations (Ralph writes here).

## How Ralph consumes a plan

`./scripts/ralph [path/to/plan.md]` runs one task per iteration:

1. Reads the plan + repo AGENTS.md.
2. Invokes the configured agent CLI with the spec.
3. Runs `./scripts/doctor`.
4. Loops until doctor passes or `MAX_ITER` is reached.

Iteration logs land in `active/.ralph-log/iter-N-<ts>.log`.
