#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# Runs every source gate PR CI runs, so a green local run means green gates on the PR.
#
# Usage: scripts/check-all-source-gates.sh

set -uo pipefail

scripts_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
failed_gates=()
for source_gate in check-license-headers.sh check-platform-cfg-confinement.sh check-no-print-debugging.sh \
  check-electron-typescript-forms.sh; do
  echo "── $source_gate"
  "$scripts_directory/$source_gate" || failed_gates+=("$source_gate")
done
if [ ${#failed_gates[@]} -ne 0 ]; then
  echo ""
  echo "❌ failed: ${failed_gates[*]}"
  exit 1
fi
