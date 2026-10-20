#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# Spike for #12: packages the Electron spike as Tatolab.app, lays the runtime unit in with today's
# scripts/assemble-tatolab-app-bundle.sh, adds what that script does not lay yet (the local relay
# at Contents/MacOS/moq-relay, the preview page at Contents/Resources/watch), and signs it.
#
# Usage: build-electron-tatolab-app.sh <output dir> <runtime unit dir> <identity> [--spike-identity] [--local-proof-test-root]
#   --spike-identity  bundle id com.tatolab.tatolab.electron-spike and agent com.tatolab.electron-spike.tatolabd,
#                     so registering it never touches the installed Tatolab's agent
set -euo pipefail
[ $# -ge 3 ] || { echo "usage: $0 <output dir> <runtime unit dir> <identity> [--local-proof-test-root]" >&2; exit 2; }
output_directory="$1"; runtime_unit_directory="$(cd "$2" && pwd)"; signing_identity="$3"; shift 3
spike_identity=false
if [ "${1:-}" = --spike-identity ]; then spike_identity=true; shift; fi
spike_directory="$(cd "$(dirname "$0")" && pwd)"
app_bundle_identifier=com.tatolab.tatolab
$spike_identity && app_bundle_identifier=com.tatolab.tatolab.electron-spike
repository_root="$(cd "$spike_directory/../.." && pwd)"
mkdir -p "$output_directory"
packaged_app="$(node "$spike_directory/package_electron_tatolab_app.mjs" "$output_directory/packaged" "$app_bundle_identifier" | tail -1)"
assembled_app="$output_directory/Tatolab.app"
rm -rf "$assembled_app"
ditto "$packaged_app" "$assembled_app"
"$repository_root/scripts/assemble-tatolab-app-bundle.sh" "$assembled_app" "$runtime_unit_directory" "$@"
install -m 0755 "$runtime_unit_directory/bin/moq-relay" "$assembled_app/Contents/MacOS/moq-relay"
rm -rf "$assembled_app/Contents/Resources/watch"
ditto "$runtime_unit_directory/lib/tatolab/watch" "$assembled_app/Contents/Resources/watch"
if $spike_identity; then
  launch_agents="$assembled_app/Contents/Library/LaunchAgents"
  mv "$launch_agents/com.tatolab.tatolabd.plist" "$launch_agents/com.tatolab.electron-spike.tatolabd.plist"
  plutil -replace Label -string com.tatolab.electron-spike.tatolabd "$launch_agents/com.tatolab.electron-spike.tatolabd.plist"
  plutil -replace AssociatedBundleIdentifiers -json '["com.tatolab.tatolab.electron-spike"]' "$launch_agents/com.tatolab.electron-spike.tatolabd.plist"
  if plutil -extract EnvironmentVariables.TATOLAB_TEST_MACHINE_ROOT raw -o - "$launch_agents/com.tatolab.electron-spike.tatolabd.plist" >/dev/null 2>&1; then
    # A test build binds no relay and no loopback HTTP unless told the ports; 4443 and 4446 are the ports the preview page names.
    plutil -insert EnvironmentVariables.TATOLAB_TEST_LOCAL_RELAY_LOOPBACK_PORT -string 4443 "$launch_agents/com.tatolab.electron-spike.tatolabd.plist"
    plutil -insert EnvironmentVariables.TATOLAB_TEST_LOCAL_RELAY_EVERY_INTERFACE_PORT -string 14443 "$launch_agents/com.tatolab.electron-spike.tatolabd.plist"
    plutil -insert EnvironmentVariables.TATOLAB_TEST_LOOPBACK_HTTP_PORT -string 4446 "$launch_agents/com.tatolab.electron-spike.tatolabd.plist"
  fi
fi
"$spike_directory/sign-electron-tatolab-app-bundle.sh" "$assembled_app" "$signing_identity"
echo "$assembled_app"
