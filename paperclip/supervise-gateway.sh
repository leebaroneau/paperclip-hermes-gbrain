#!/usr/bin/env bash
# Supervisor for a single Hermes profile gateway.
#
# Runs `hermes --profile $PROFILE gateway run` in a restart loop with a fixed
# backoff. Writes the live gateway PID to $PID_FILE so the container's
# healthcheck can verify liveness. Forwards SIGTERM/SIGINT to the gateway and
# exits cleanly on container shutdown instead of immediately respawning.
#
# Invoked by /opt/paperclip/hermes-entrypoint.sh under the `node` user.

set -eu

profile="${1:?usage: supervise-gateway.sh <profile> <log_file> <pid_file>}"
log_file="${2:?usage: supervise-gateway.sh <profile> <log_file> <pid_file>}"
pid_file="${3:?usage: supervise-gateway.sh <profile> <log_file> <pid_file>}"
backoff="${HERMES_GATEWAY_BACKOFF_SECS:-5}"

child_pid=""
shutdown=0

log() {
  printf '[gateway-supervisor %s] %s\n' "$profile" "$1" >> "$log_file"
}

cleanup() {
  shutdown=1
  if [[ -n "$child_pid" ]] && kill -0 "$child_pid" 2>/dev/null; then
    log "received shutdown signal; forwarding SIGTERM to gateway pid=$child_pid"
    kill -TERM "$child_pid" 2>/dev/null || true
  fi
}
trap cleanup TERM INT

log "starting (backoff=${backoff}s, pid_file=$pid_file)"

while [[ "$shutdown" -eq 0 ]]; do
  hermes --profile "$profile" gateway run --replace --accept-hooks >> "$log_file" 2>&1 &
  child_pid=$!
  printf '%s\n' "$child_pid" > "$pid_file"

  set +e
  wait "$child_pid"
  exit_code=$?
  set -e

  rm -f "$pid_file"

  if [[ "$shutdown" -eq 1 ]]; then
    log "shutdown complete (last pid=$child_pid exit=$exit_code)"
    break
  fi

  log "gateway pid=$child_pid exited (code=$exit_code); restarting in ${backoff}s"

  # Sleep in a way that's still interruptible by SIGTERM.
  sleep "$backoff" &
  sleep_pid=$!
  wait "$sleep_pid" 2>/dev/null || true
done
