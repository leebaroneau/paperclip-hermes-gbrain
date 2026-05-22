#!/usr/bin/env bash
# Healthcheck for the multi-profile Hermes container.
#
# Exits 0 iff:
#   1. The entrypoint has finished bootstrapping (/tmp/hermes-entrypoint-ready)
#   2. Every profile in /tmp/hermes-supervisor/expected-profiles has a live PID
#      in /tmp/hermes-supervisor/<profile>.pid
#
# Wire this into docker-compose:
#   healthcheck:
#     test: ["CMD", "/opt/paperclip/check-gateways.sh"]
#     interval: 30s
#     timeout: 10s
#     start_period: 60s
#     retries: 3

set -eu

if [[ ! -f /tmp/hermes-entrypoint-ready ]]; then
  echo "entrypoint not ready"
  exit 1
fi

state_dir=/tmp/hermes-supervisor
expected_file="$state_dir/expected-profiles"

# No supervisor state yet (e.g. autostart disabled, or no gateway profiles
# discovered) → the entrypoint is the only thing we need to know is alive.
[[ -f "$expected_file" ]] || exit 0

while IFS= read -r profile; do
  [[ -n "$profile" ]] || continue
  pid_file="$state_dir/${profile}.pid"

  if [[ ! -f "$pid_file" ]]; then
    echo "gateway $profile: pid file missing (in backoff or never started)"
    exit 1
  fi

  pid=$(cat "$pid_file" 2>/dev/null || true)
  if [[ -z "$pid" ]] || ! kill -0 "$pid" 2>/dev/null; then
    echo "gateway $profile: pid=$pid not alive"
    exit 1
  fi
done < "$expected_file"

exit 0
