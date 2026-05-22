---
name: gbrain
description: Use the role-specific GBrain home for durable company memory, prior decisions, project context, and learned summaries.
triggers:
  - "gbrain"
  - "memory"
  - "remember"
  - "prior context"
  - "brand context"
  - "project context"
---

# GBrain

Use this skill whenever a task depends on durable company knowledge: people,
brands, projects, decisions, meetings, strategy, incidents, or prior learned
context.

## Source Of Truth

Each Paperclip-managed Hermes role has its own `GBRAIN_HOME`. Use that home for
role-specific durable memory. Do not crawl or write to another role's GBrain
home unless the task explicitly grants that access.

## Operating Rules

1. Before answering from memory, search GBrain first with `gbrain search` or
   `gbrain query`.
2. If the MCP server is available, prefer the typed GBrain tools. If not, use
   the CLI with the current `GBRAIN_HOME`.
3. Save only durable knowledge: decisions, project context, reusable learnings,
   and facts the company may need again.
4. Do not store secrets, raw runtime logs, transient task state, or another
   profile's private working notes.
5. When you write or edit GBrain markdown, run `gbrain import "$GBRAIN_HOME"
   --no-embed` when local import is available.

## Completion Note

When a task creates or updates durable memory, include the GBrain page slug in
the Paperclip issue comment or final status update.
