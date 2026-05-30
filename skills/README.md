# Repo-local skills

Discoverable by any agent that supports filesystem skills (Claude Code, Codex CLI,
Aider, Cursor, etc.). Each subdirectory holds one `SKILL.md` describing a repeatable
workflow this repo expects to run frequently.

## Index

- `review/SKILL.md` — agent-driven review of pending changes before requesting human review.
- `verify/SKILL.md` — validate behavior against the deployed environment.
- `deploy/SKILL.md` — production deploy procedure (push, monitor, rollback).

## Conventions

- Skills are repository-local. They override anything an external agent ships with the same name.
- Each `SKILL.md` opens with a YAML frontmatter block (`name`, `description`).
- Keep skills short; they are invoked, not read end-to-end.
- Update a skill whenever the workflow it documents changes.
