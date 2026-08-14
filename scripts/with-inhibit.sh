#!/usr/bin/env bash
set -euo pipefail

why="${INHIBIT_WHY:-Development server}"

if command -v systemd-inhibit >/dev/null 2>&1; then
  systemd-inhibit \
    --what=idle:sleep \
    --why="$why" \
    "$@" 2>/dev/null || exec "$@"
  exit $?
fi

exec "$@"
