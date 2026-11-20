#!/usr/bin/env bash
# Usage: vercel-deploy.sh <directory> <label>
# Runs vercel pull → build → deploy --prebuilt for one project. On failure the
# tail of the CLI output is emitted as an ::error annotation so it is visible
# in the run summary (GitHub masks secrets such as VERCEL_TOKEN automatically).
set -uo pipefail
dir="$1"
label="$2"
cd "$dir"
log="$(mktemp)"

run() {
  echo "::group::$label: vercel $1"
  vercel "$@" --token="$VERCEL_TOKEN" 2>&1 | tee -a "$log"
  local status=${PIPESTATUS[0]}
  echo "::endgroup::"
  if [ "$status" -ne 0 ]; then
    local tail
    tail="$(tail -n 20 "$log" | sed 's/%/%25/g' | tr '\n' ' ' | cut -c1-1500)"
    echo "::error title=$label: vercel $1 failed::$tail"
    exit "$status"
  fi
}

run pull --yes --environment=production
run build --prod
run deploy --prebuilt --prod
