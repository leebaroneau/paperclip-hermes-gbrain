#!/usr/bin/env bash
set -euo pipefail

HERMES_DATA_ROOT="${HERMES_DATA_ROOT:-/opt/data/hermes}"
GBRAIN_DATA_ROOT="${GBRAIN_DATA_ROOT:-/opt/data/gbrain}"
HERMES_PROFILES="${HERMES_PROFILES:-default}"
TEMPLATE_DIR="/opt/hermes-runtime/templates"

mkdir -p "$HERMES_DATA_ROOT/profiles" "$GBRAIN_DATA_ROOT"

write_env_file() {
  local env_file="$1"

  if [[ -f "$env_file" ]]; then
    return 0
  fi

  if [[ -z "${OPENAI_API_KEY:-}" && -z "${ANTHROPIC_API_KEY:-}" && -z "${OPENROUTER_API_KEY:-}" ]]; then
    return 0
  fi

  umask 077
  {
    [[ -n "${OPENAI_API_KEY:-}" ]] && printf 'OPENAI_API_KEY=%s\n' "$OPENAI_API_KEY"
    [[ -n "${ANTHROPIC_API_KEY:-}" ]] && printf 'ANTHROPIC_API_KEY=%s\n' "$ANTHROPIC_API_KEY"
    [[ -n "${OPENROUTER_API_KEY:-}" ]] && printf 'OPENROUTER_API_KEY=%s\n' "$OPENROUTER_API_KEY"
  } > "$env_file"
}

install_gbrain_skills() {
  local profile_home="$1"
  local gbrain_source="${GBRAIN_SKILLS_SOURCE:-/opt/gbrain/skills}"
  local gbrain_dest="$profile_home/skills/gbrain"

  if [[ ! -d "$gbrain_source" ]]; then
    return 0
  fi

  mkdir -p "$gbrain_dest"
  for skill_dir in "$gbrain_source"/*; do
    [[ -d "$skill_dir" && -f "$skill_dir/SKILL.md" ]] || continue
    local name
    name="$(basename "$skill_dir")"
    if [[ -e "$gbrain_dest/$name" && ! -L "$gbrain_dest/$name" ]]; then
      continue
    fi
    ln -sfn "$skill_dir" "$gbrain_dest/$name"
  done
}

install_hermes_bundled_skills() {
  local profile_home="$1"
  local src="${HERMES_BUNDLED_SKILLS_SOURCE:-/usr/local/lib/hermes-agent/skills}"

  if [[ ! -d "$src" ]]; then
    return 0
  fi

  mkdir -p "$profile_home/skills"
  for skill_dir in "$src"/*; do
    [[ -d "$skill_dir" ]] || continue
    local name
    name="$(basename "$skill_dir")"
    # Skip if a non-symlink already exists (Hermes lazy-installed or user-modified)
    if [[ -e "$profile_home/skills/$name" && ! -L "$profile_home/skills/$name" ]]; then
      continue
    fi
    ln -sfn "$skill_dir" "$profile_home/skills/$name"
  done
}

# Symlink agent-stack-shipped skills (e.g. using-paperclip) into every
# Hermes profile's skills/agent-stack/ directory. Mirrors install_gbrain_skills
# pattern. Source dir is baked into the image at /opt/hermes-runtime/skills/.
install_agent_stack_skills() {
  local profile_home="$1"
  local source="${AGENT_STACK_SKILLS_SOURCE:-/opt/hermes-runtime/skills}"
  local dest="$profile_home/skills/agent-stack"

  if [[ ! -d "$source" ]]; then
    return 0
  fi

  mkdir -p "$dest"
  for skill_dir in "$source"/*; do
    [[ -d "$skill_dir" && -f "$skill_dir/SKILL.md" ]] || continue
    local name
    name="$(basename "$skill_dir")"
    if [[ -e "$dest/$name" && ! -L "$dest/$name" ]]; then
      continue
    fi
    ln -sfn "$skill_dir" "$dest/$name"
  done
}

# Idempotently reconcile mcp_servers between the template and a profile config.
#
# Two operations, both conservative — operator customisations are preserved:
#   1. ADD-NEW: template entries not present in the profile are copied verbatim.
#      New MCP servers added to the template (e.g. a future foo MCP) reach
#      existing profiles on next boot.
#   2. MERGE-ENV: for entries that exist in BOTH, any env keys defined in the
#      template's env: block but MISSING from the profile's env: block are
#      added. Existing env values are never overwritten. This closes the gap
#      where a template fix (e.g. adding PAPERCLIP_API_KEY to the paperclip
#      MCP env block) would otherwise never reach existing profiles.
#
# Non-env fields (command, args, timeout, custom keys) on existing entries
# are still NEVER touched — operators who edited those keep their changes.
#
# Uses Hermes' bundled Python interpreter for PyYAML.
sync_mcp_servers_from_template() {
  local profile_config="$1"
  local template_config="$TEMPLATE_DIR/config.yaml"
  local python_bin="/usr/local/lib/hermes-agent/venv/bin/python"

  if [[ ! -f "$profile_config" || ! -f "$template_config" || ! -x "$python_bin" ]]; then
    return 0
  fi

  "$python_bin" - "$template_config" "$profile_config" <<'PYEOF'
import sys
import yaml

template_path, profile_path = sys.argv[1], sys.argv[2]

with open(template_path) as f:
    template = yaml.safe_load(f) or {}

with open(profile_path) as f:
    profile = yaml.safe_load(f) or {}

template_mcp = template.get("mcp_servers") or {}
if not template_mcp:
    sys.exit(0)

profile_mcp = profile.get("mcp_servers") or {}
added_entries = []
merged_env = {}  # name -> list of env keys added

for name, spec in template_mcp.items():
    if name not in profile_mcp:
        profile_mcp[name] = spec
        added_entries.append(name)
        continue

    # Merge missing env keys onto existing entry. Never overwrite.
    template_env = (spec or {}).get("env") or {}
    if not isinstance(template_env, dict) or not template_env:
        continue

    existing_entry = profile_mcp[name]
    if not isinstance(existing_entry, dict):
        continue

    existing_env = existing_entry.get("env") or {}
    if not isinstance(existing_env, dict):
        existing_env = {}

    added_keys = []
    for env_key, env_val in template_env.items():
        if env_key not in existing_env:
            existing_env[env_key] = env_val
            added_keys.append(env_key)

    if added_keys:
        existing_entry["env"] = existing_env
        merged_env[name] = added_keys

if not added_entries and not merged_env:
    sys.exit(0)

profile["mcp_servers"] = profile_mcp
with open(profile_path, "w") as f:
    yaml.safe_dump(profile, f, sort_keys=False)

if added_entries:
    print(f"[bootstrap] added mcp_servers to {profile_path}: {', '.join(added_entries)}", file=sys.stderr)
for name, keys in merged_env.items():
    print(f"[bootstrap] merged env keys onto {name} in {profile_path}: {', '.join(keys)}", file=sys.stderr)
PYEOF
}

IFS=',' read -ra profiles <<< "$HERMES_PROFILES"
for raw_profile in "${profiles[@]}"; do
  profile="$(echo "$raw_profile" | tr '[:upper:]' '[:lower:]' | xargs)"
  if [[ -z "$profile" ]]; then
    continue
  fi
  if [[ ! "$profile" =~ ^[a-z0-9_-]+$ ]]; then
    echo "Invalid profile: $profile" >&2
    exit 1
  fi

  if [[ "$profile" == "default" ]]; then
    profile_home="$HERMES_DATA_ROOT"
  else
    profile_home="$HERMES_DATA_ROOT/profiles/$profile"
  fi
  gbrain_home="$GBRAIN_DATA_ROOT/$profile"

  mkdir -p "$profile_home" "$gbrain_home"

  if [[ ! -f "$profile_home/config.yaml" ]]; then
    cp "$TEMPLATE_DIR/config.yaml" "$profile_home/config.yaml"
  else
    sync_mcp_servers_from_template "$profile_home/config.yaml"
  fi

  if [[ ! -f "$profile_home/SOUL.md" ]]; then
    if [[ -f "$TEMPLATE_DIR/SOUL.$profile.md" ]]; then
      cp "$TEMPLATE_DIR/SOUL.$profile.md" "$profile_home/SOUL.md"
    else
      cp "$TEMPLATE_DIR/SOUL.default.md" "$profile_home/SOUL.md"
    fi
  fi

  if [[ ! -f "$profile_home/DELEGATION_PROTOCOL.md" && -f "$TEMPLATE_DIR/DELEGATION_PROTOCOL.md" ]]; then
    cp "$TEMPLATE_DIR/DELEGATION_PROTOCOL.md" "$profile_home/DELEGATION_PROTOCOL.md"
  fi

  if [[ ! -f "$profile_home/LEARNING_PROTOCOL.md" && -f "$TEMPLATE_DIR/LEARNING_PROTOCOL.md" ]]; then
    cp "$TEMPLATE_DIR/LEARNING_PROTOCOL.md" "$profile_home/LEARNING_PROTOCOL.md"
  fi

  write_env_file "$profile_home/.env"
  install_gbrain_skills "$profile_home"
  install_hermes_bundled_skills "$profile_home"
  install_agent_stack_skills "$profile_home"

  if [[ ! -f "$gbrain_home/.gbrain/config.json" ]]; then
    GBRAIN_HOME="$gbrain_home" gbrain init --pglite
    GBRAIN_HOME="$gbrain_home" gbrain config set search.mode conservative >/dev/null 2>&1 || true
  fi
done

# Sweep any profile homes profile-sync may have created at runtime (per-role
# Hermes profiles for Paperclip agents). Each gets the same MCP-server merge
# pass and the agent-stack skill symlinks so new template entries and new
# bundled skills propagate without manual patching.
if [[ -d "$HERMES_DATA_ROOT/profiles" ]]; then
  for runtime_profile_home in "$HERMES_DATA_ROOT"/profiles/*/; do
    [[ -d "$runtime_profile_home" ]] || continue
    [[ -f "$runtime_profile_home/config.yaml" ]] || continue
    sync_mcp_servers_from_template "$runtime_profile_home/config.yaml"
    install_agent_stack_skills "$runtime_profile_home"
  done
fi
