#!/usr/bin/env bash
# Profile-aware wrapper for paperclip-holographic-memory-mcp.
# Derives PAPERCLIP_HOLO_MEMORY_DB from HERMES_HOME so the memory store is
# always scoped to the active Hermes profile without any manual configuration.
export PAPERCLIP_HOLO_MEMORY_DB="${HERMES_HOME:-/data/hermes}/memory_store.db"
exec paperclip-holographic-memory-mcp "$@"
