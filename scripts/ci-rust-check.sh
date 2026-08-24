#!/usr/bin/env bash

set -uo pipefail

log_path="${RUNNER_TEMP:-/tmp}/blunote-clippy.log"

set +e
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings >"${log_path}" 2>&1
status=$?
set -e

sed -n '1,240p' "${log_path}"

if [[ ${status} -ne 0 && "${GITHUB_ACTIONS:-false}" == "true" ]]; then
  while IFS= read -r line; do
    escaped="${line//'%'/'%25'}"
    escaped="${escaped//$'\r'/'%0D'}"
    escaped="${escaped//$'\n'/'%0A'}"
    printf '::error title=Linux Rust check::%s\n' "${escaped}"
  done < <(tail -n 30 "${log_path}")
fi

exit "${status}"
