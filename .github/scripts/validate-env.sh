#!/usr/bin/env bash
# Validates that all required environment variables are set and non-empty.
# Usage: ./validate-env.sh PW_DB_TYPE PW_DB_HOST PW_DB_PORT ...
# Exits with code 1 if any variable is missing or empty.

set -euo pipefail

for var_name in "$@"; do
  if [ -z "${!var_name:-}" ]; then
    echo "Missing required variable: ${var_name}" >&2
    exit 1
  fi
done
