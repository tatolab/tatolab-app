#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# Builds streamlib's runtime unit (bin/tatolabd, bin/tatolab, bin/moq-relay, lib/tatolab/lend) in a
# streamlib checkout and prints the unit's directory. The checkout's own target directory is used.
#
# Usage: build-tatolab-runtime-unit.sh <streamlib checkout> [--local-proof-test-root]
#   --local-proof-test-root  both binaries keep every machine directory under
#                            TATOLAB_TEST_MACHINE_ROOT (never for a shipped build)
set -euo pipefail

usage() { awk '/^# Usage:/{p=1} p&&/^#/{sub(/^# ?/,""); print; next} p{exit}' "$0" >&2; exit 2; }
[ $# -ge 1 ] || usage
streamlib_checkout="$(cd "$1" && pwd)"
shift
xtask_arguments=(build-runtime --release)
while [ $# -gt 0 ]; do
  case "$1" in
    --local-proof-test-root) xtask_arguments+=(--machine-directories-under-a-test-root) ;;
    *) usage ;;
  esac
  shift
done

[ -f "$streamlib_checkout/xtask/Cargo.toml" ] || { echo "not a streamlib checkout: $streamlib_checkout" >&2; exit 1; }
export CARGO_TARGET_DIR="$streamlib_checkout/target"
(cd "$streamlib_checkout" && cargo xtask "${xtask_arguments[@]}") >&2

runtime_unit_directory="$streamlib_checkout/target/tatolab-runtime"
for required in bin/tatolabd bin/tatolab bin/moq-relay lib/tatolab/lend/tatolab/runtime; do
  [ -e "$runtime_unit_directory/$required" ] || { echo "runtime unit is missing $required" >&2; exit 1; }
done
echo "$runtime_unit_directory"
