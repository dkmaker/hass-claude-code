#!/usr/bin/env bash
# ==============================================================================
# Claude Code Add-on: Claude entrypoint
# Launches Claude Code with flags based on add-on configuration.
# This runs inside tmux, spawned by ttyd.
# ==============================================================================
set -e

# Source environment
if [[ -f /etc/profile.d/claude.sh ]]; then
    # shellcheck source=/dev/null
    source /etc/profile.d/claude.sh
fi

# Build claude args
declare -a CLAUDE_ARGS=()

# Model selection
if [[ -n "${CLAUDE_MODEL:-}" ]]; then
    CLAUDE_ARGS+=(--model "${CLAUDE_MODEL}")
fi

# Read config for yolo mode and model using bashio if available
if command -v bashio &>/dev/null; then
    if bashio::config.true 'yolo_mode' 2>/dev/null; then
        CLAUDE_ARGS+=(--dangerously-skip-permissions)
    fi

    model=$(bashio::config 'model' 2>/dev/null || true)
    if [[ -n "${model}" && "${model}" != "default" ]]; then
        CLAUDE_ARGS+=(--model "${model}")
    fi
fi

# Working directory
cd /homeassistant 2>/dev/null || cd /root

echo "Starting Claude Code..."
echo "Working directory: $(pwd)"
echo ""

# Launch Claude Code
exec claude "${CLAUDE_ARGS[@]}"
