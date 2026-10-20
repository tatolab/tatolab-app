#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# Spike for #12: signs an assembled Electron Tatolab.app inside-out with the hardened runtime —
# every loose Mach-O in Contents/Frameworks (the runtime's and Electron's dylibs), each framework,
# each helper app, tatolabd, tatolab-cli and moq-relay, then the app.
#
# Usage: sign-electron-tatolab-app-bundle.sh <Tatolab.app> <identity>
set -euo pipefail
[ $# -eq 2 ] || { echo "usage: $0 <Tatolab.app> <identity>" >&2; exit 2; }
app_bundle="$(cd "$1" && pwd)"
signing_identity="$2"
contents="$app_bundle/Contents"
spike_directory="$(cd "$(dirname "$0")" && pwd)"
repository_root="$(cd "$spike_directory/../.." && pwd)"
app_entitlements="$spike_directory/entitlements/app.entitlements"
helper_entitlements="$spike_directory/entitlements/helper.entitlements"
renderer_helper_entitlements="$spike_directory/entitlements/renderer-helper.entitlements"
tatolabd_entitlements="$repository_root/packaging/entitlements/tatolabd.entitlements"
codesign_common_arguments=(--force --options runtime --timestamp --sign "$signing_identity")
is_mach_o() { [[ "$(file -b "$1")" == Mach-O* ]]; }

loose_mach_o_count=0
while IFS= read -r -d '' framework_file; do
  is_mach_o "$framework_file" || continue
  case "$framework_file" in
    *.app/Contents/MacOS/*) continue ;;
  esac
  codesign "${codesign_common_arguments[@]}" "$framework_file"
  loose_mach_o_count=$((loose_mach_o_count + 1))
done < <(find "$contents/Frameworks" -type f -print0)

while IFS= read -r -d '' framework_bundle; do
  codesign "${codesign_common_arguments[@]}" "$framework_bundle"
done < <(find "$contents/Frameworks" -maxdepth 1 -name '*.framework' -print0)

while IFS= read -r -d '' helper_app; do
  case "$helper_app" in
    *"(Renderer).app") entitlements_for_this_helper="$renderer_helper_entitlements" ;;
    *) entitlements_for_this_helper="$helper_entitlements" ;;
  esac
  codesign "${codesign_common_arguments[@]}" --entitlements "$entitlements_for_this_helper" "$helper_app"
done < <(find "$contents/Frameworks" -maxdepth 1 -name '*.app' -print0)

codesign "${codesign_common_arguments[@]}" --identifier com.tatolab.tatolabd \
  --entitlements "$tatolabd_entitlements" "$contents/MacOS/tatolabd"
codesign "${codesign_common_arguments[@]}" --identifier com.tatolab.tatolab-cli "$contents/MacOS/tatolab-cli"
if [ -e "$contents/MacOS/moq-relay" ]; then
  codesign "${codesign_common_arguments[@]}" --identifier com.tatolab.moq-relay "$contents/MacOS/moq-relay"
fi
codesign "${codesign_common_arguments[@]}" --entitlements "$app_entitlements" "$app_bundle"

codesign --verify --deep --strict "$app_bundle"
echo "signed $app_bundle: $loose_mach_o_count loose Mach-O in Frameworks, frameworks, helpers, runtime executables, the app"
